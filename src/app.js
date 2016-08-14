/// <reference path="thirdparty/jquery-2.1.4.min.js" />
/// <reference path="thirdparty/json2.js" />

// TODO: javascript intellisense has problem if visual studio project file is not in root folder.
//       The workaround is to use absolute paths

try {
    tps.sys.RestartHTA(tps.sys.processOption.requestAdmin | tps.sys.processOption.escapeWOW64);
} catch (e) { }

var functions = {};
var activeFunction = null;
var config = {
    runhistory: {}
};
var configfile = shell ? shell.ExpandEnvironmentStrings("%APPDATA%\\jsrunner\\config.js") : "";
var logfile = shell ? shell.ExpandEnvironmentStrings("%APPDATA%\\jsrunner\\jsrunnerlog.txt") : "";

function Main() {
    Init();
    LoadConfig();
    FillFunctionTableWithFilter("");
    tps.util.UpdateProperty(functions, config.runhistory);
}

function Init() {

    functions = GetRunnableFunctions();

    $("#back").click(function () {
        showMainpage();
    });

    $("#viewlog").click(function () {
        shellapp.ShellExecute(logfile);
    });

    $("#funcfilter").keyup(function () {
        FillFunctionTableWithFilter($(this).val());
    });

    $("#run").bind("click", function () {
        $(this).prop("disabled", true);
        SaveConfig();
        $("#result").empty();
        
        window.setTimeout(function () {
            var result = ExecuteFunction(activeFunction);
            // update func description in case there is any status inside it.
            ShowFunction(activeFunction);
            showExecuteResult(result);
            $("#run").prop("disabled", false);
        }, 10);
    });

    try {
        tps.sys.AddToPath(tps.sys.processEnv, tps.sys.GetScriptDir() + "\\thirdparty");
        if (fso.FileExists(logfile)) {
            fso.DeleteFile(logfile);
        }
    } catch (e) { }

    tps.log.AddFileDevice(logfile);
}

function LoadConfig() {
    var tempconf;
    try {
        tempconf = JSON.parse(tps.file.ReadTextFileSimple(configfile));
    } catch (e) {
        tempconf = {};
    }
    tps.util.MergeProperty(config, tempconf);
}

function SaveConfig() {
    try {
        SaveRunHistoryToConfig();
        tps.file.WriteTextFileSimple(JSON.stringify(config, null, 4), configfile);
    } catch (e) { }
}

function SaveRunHistoryToConfig() {
    $.each(functions, function (k, v) {
        config.runhistory[k] = { params: {}};
        var fr = config.runhistory[k];
        $.each(v.params, function (i, p) {
            fr.params[i] = { value: p.value };
        });
    });
}

function ApplyRunHistoryFromConfig() {
    tps.util.MergeProperty();
}

function GetRunnableFunctions() {
    var funcs = {};
    var pps = Object.keys(window);
    for (var i in pps) {
        var fn = pps[i];
        var obj = window[fn];
        if (typeof obj === "function") {
            var func = obj;
            var jsdoc = extractJsdocOfFunction(func);
            if (jsdoc != null) {
                var info = parseJsdoc(jsdoc);
                info.name = fn;
                funcs[fn] = info;
            }
        }
    }
    return funcs;
}

function FillFunctionTableWithFilter(filter) {
    var filters = filter.split(" ");
    var selected = [];
    for (var fn in functions) {
        var match = true;
        var func = functions[fn];
        for (var i in filters) {
            var f = filters[i].trim();
            if (f.length > 0 &&
                func.name.toLowerCase().indexOf(f) == -1 &&
                func.summary.toLowerCase().indexOf(f) == -1 &&
                func.description.toLowerCase().indexOf(f) == -1) {
                match = false;
                break;
            }
        }
        if (match) {
            selected.push(func);
        }
    }

    FillFunctionTable(selected);
}

function FillFunctionTable(funcs) {
    var tbody = $("#functions > tbody");
    tbody.empty();
    for (var i in funcs) {
        var func = funcs[i];
        tbody.append(
            $("<tr>").addClass("clickable")
            .append($("<td>").text(func.name))
            .append($("<td>").text(func.summary))
            .click((function (f) {
                return function () {
                    ShowFunction(f);
                    showFunctionPage();
                }})(func))
            );
    }
}

// returns: [{type:string, value, style, startPos, endPos}]
function splitJsDocToTags(str) {
    var result = [];
    var pos = 0;
    var processedPos = 0;
    while (pos < str.length) {
        var tag = null;

        if (str.charAt(pos) == '\n' && str.charAt(pos+1) == '\n') {
            tag = {type:"br", startPos: pos, endPos: pos + 2};
        } else if (str.charAt(pos) == '\n' && str.charAt(pos + 1) == '-') {
            // list
            pos++;
            var p = pos;
            var arr = [];
            for (; ;) {
                var q = str.indexOf("\n", p);
                if (q == -1) {
                    q = str.length;
                    arr.push(str.substr(p+1, q - p - 1));
                    p = str.length;
                    break;
                }

                arr.push(str.substr(p+2, q - 2 - p));

                p = q + 1;
                if (str.charAt(p) != '-') {
                    break;
                }
            }
            tag = {
                type: "list",
                startPos: pos,
                endPos: p,
                value: arr
            }

        } else if (str.substr(pos, 7) == "{@link ") {
            var pos2 = str.indexOf("}", pos);
            if (pos2 != -1) {
                var content = str.substr(pos + 7, pos2 - pos - 7);
                var arr = content.splitHead("|") || content.splitHead(" ") || [content, content];
                tag = {
                    type: "link",
                    startPos: pos,
                    endPos: pos2 + 1,
                    value: {
                        url: arr[0],
                        text: arr[1]
                    }
                };
            }
        } else if (str.substr(pos, 5) == "{@js ") {
            var pos2 = str.indexOf("}", pos);
            if (pos2 != -1) {
                var content = str.substr(pos + 5, pos2 - pos - 5);
                var val;
                eval("val =" + content);
                if ($.isArray(val)) {
                    tag = { type: "list", style: "status", startPos: pos, endPos: pos2 + 1, value: val };
                } else {
                    if (!val) val = "";
                    tag = { type: "text", style: "status", startPos: pos, endPos: pos2 + 1, value: val.toString() };
                }
            }
        }

        if (tag != null) {
            if (pos > processedPos) {
                result.push({type:"text", startPos: processedPos, endPos: pos, value: str.substr(processedPos, pos - processedPos)});
            }
            result.push(tag);
            pos = tag.endPos;
            processedPos = tag.endPos;
        } else {
            pos++;
        }
    }

    if (pos > processedPos) {
        result.push({type:"text", startPos: processedPos, endPos: pos, value: str.substr(processedPos, pos - processedPos)});
    }

    return result;
}

function createNodeFromData(v) {
    if (v === undefined || v === null) {
        return "done";
    }

    if (typeof v !== "object") {
        return v.toString();
    }

    if (v.constructor === Array) {
        // represents as table if:
        // 1. all its childs are object
        // 2. there exists one property that is shared by multiple objects
        var allChildAreObject = true;
        var propertyShared = false;
        var propertySet = {};
        for (var i in v) {
            var item = v[i];
            if (typeof item !== "object" ||
                item.constructor === Array) {
                allChildAreObject = false;
            }
            for (var p in item) {
                if (p in propertySet) {
                    propertyShared = true;
                } else {
                    propertySet[p] = true;
                }
            }
        }

        if (allChildAreObject && propertyShared) {
            var $table = $('<table>');
            var $thead = $('<thead>');
            var $tr_head = $('<tr>');
            for (var p in propertySet) {
                $tr_head.append($('<td>').text(p));
            }

            var $tbody = $('<tbody>');
            for (var i in v) {
                var $tr = $('<tr>');
                for (var p in propertySet) {
                    $tr.append($('<td>').append(createNodeFromData(v[i][p])));
                }
                $tbody.append($tr);
            }

            $table.append($thead.append($tr_head))
                  .append($tbody);
            return $table;

        } else {
            // create simple table
            var $table = $('<table>');
            for (var i in v) {
                $table.append($('<tr>').append($('<td>').append(createNodeFromData(v[i]))));
            }
            return $table;
        }
    } else {
        // object, create property table
        var $table = $('<table>');
        for (var p in v) {
            $table.append($('<tr>').append($('<td class="shrink">').text(p))
                                   .append($('<td>').append(createNodeFromData(v[p])))
                );
        }
        return $table;
    }
}

function showExecuteResult(result) {
    var $result = $("#result");
    $result.empty();
    var $content;
    if (result.ret === false) {
        $content = $('<span class="btn-error form-control">').text("failed" + (result.error? ": " + result.error: ""));
    } else if (result.ret === true) {
        $content = $('<span class="btn-success form-control">').text("succeeded");
    } else {
        $content = createNodeFromData(result.ret);
    }

    $result.append($content);
}

function createNodeFromJsDoc(str) {
    var $div = $("<div>");
    var tags = splitJsDocToTags(str);

    for (var i in tags) {
        var tag = tags[i];
        var $node;
        if (tag.type == "text") {
            $node = $("<span>").text(tag.value);
        } else if (tag.type == "br") {
            $node = $("<p>");
        } else if (tag.type == "link") {
            $node = $("<a>", {
                href: tag.value.url,
                text: tag.value.text
            });
        } else if (tag.type == "status") {
            $node = $('<span class="status">').text(tag.value);
        } else if (tag.type == "list") {
            $node = $("<ul>");
            $.each(tag.value, function (k, v) {
                $node.append($("<li>").text(v));
            });
        }

        if (tag.style) {
            $node.addClass(tag.style);
        }
        $div.append($node);
    }

    return $div;
}

function stripLeft(str, matcher) {
    if (str.startsWith(matcher)) {
        return str.substr(matcher.length);
    }
    return null;
}

function ShowFunction(func) {
    $("#funcname").text(func.name);
    $("#funcsummary").text(func.summary);
    $("#funcdesc").empty();
    $("#funcdesc").append(createNodeFromJsDoc(func.description));
    $("#result").empty();

    $("#paramcontainer").empty();
    var spec = "";
    for (var i in func.params) {
        var div = $("<div>").addClass("input-group");
        $("#paramcontainer").append(div);

        var param = func.params[i];

        if (param.type == "string") {
            if (param.value === null) param.value = "";
            div.append($('<span class="input-group-addon">').text(param.description));
            var textbox = $('<input class="form-control" type="text">').val(param.value);
            div.append(textbox);
            textbox.on("change", (function (p, t) {
                return function() {
                    p.value = t.val();
                }
            })(param, textbox));
        }
        else if (param.type == "filename") {
            if (param.value === null) param.value = "";
            div.append($('<span class="input-group-addon">').text(param.description));
            var textbox = $('<input class="form-control" type="text">').val(param.value).prop("readonly", true);
            div.append(textbox);
            var btngroup = $('<div class="input-group-btn">');
            var btn = $('<label class="btn btn-default" for="file-selector">');
            var input = $('<input id="file-selector" type="file" style="display:none">').prop("value", param.value);
            btn.append(input);
            btn.append("...");
            input.on("change", (function (p, t, x) {
                return function () {
                    p.value = t.val();
                    x.val(t.val());
                }
            })(param, input, textbox));
            div.append(btngroup.append(btn));
        }
        else if (param.type == "number") {
            if (param.value === null) param.value = "";
            div.append($('<span class="input-group-addon">').text(param.description));
            var textbox = $('<input class="form-control" type="text">').addClass("numeric-only").val(param.value);
            div.append(textbox);
            textbox.on("change", (function (p, t) {
                return function () {
                    p.value = parseInt(t.val());
                }
            })(param, textbox));
        }
        else if (param.type == "bool") {
            if (param.value === null) param.value = false;
            var id = "func_param_id_" + i;
            var checkbox = $('<input type="checkbox">').attr("id", id);
            checkbox[0].checked = param.value;
            div.append($('<span class="input-group-addon">').append(checkbox));
            div.append($('<label class="form-control">').text(param.description).attr("for", id));
            checkbox.on("change", (function (p, t) {
                return function () {
                    p.value = t[0].checked;
                }
            })(param, checkbox));
        }
        else if (spec = stripLeft(param.type, "string in ")) {
            spec = spec.trim();
            var specWithoutQuote = tps.util.RemoveQuote(spec);
            var slist = [];
            if (specWithoutQuote == spec) {
                // spec has no quote, treat it as javascript returning array
                slist = eval(specWithoutQuote);
            } else {
                slist = specWithoutQuote.split(" ");
            }

            // selection list here
            if (param.value === null) param.value = slist[0];
            div.append($('<span class="input-group-addon">').text(param.description));
            var selectbox = $('<select class="form-control">');
            div.append(selectbox);
            $.each(slist, function (k, v) {
                if (v == "-") {
                    selectbox.append($("<option disabled>──────────</option>"));
                } else {
                    selectbox.append($("<option/>", { value: v, text: v }));
                }
            });
            
            selectbox.val(param.value);
            selectbox.on("change", (function (p, t) {
                return function () {
                    p.value = t.val();
                }
            })(param, selectbox));
        }
        else if (spec = stripLeft(param.type, "string with recommendation ")) {
            spec = spec.trim();
            var specWithoutQuote = tps.util.RemoveQuote(spec);
            var recommends = [];
            if (specWithoutQuote == spec) {
                recommends = eval(specWithoutQuote);
            } else {
                recommends = specWithoutQuote.split(",");
            }

            div.append($('<span class="input-group-addon">').text(param.description));
            var textbox = $('<input class="form-control" type="text">').val(param.value);
            div.append(textbox);
            var $recommendationGroup = $('<div class="input-group-btn">');
            $.each(recommends, function (i, v) {
                v = v.trim();
                if (v != "") {
                    var arr = v.splitHead(":");
                    var name = arr[0].trim();
                    var url = arr[1].trim();
                    var $btn = $('<button class="btn btn-default">').text(name);
                    $btn.on("click", (function (p, t, s) {
                        return function () {
                            t.val(s);
                            p.value = s;
                        }
                    })(param, textbox, url));
                    $recommendationGroup.append($btn);
                }
            });
            
            div.append($recommendationGroup);
            textbox.on("change", (function (p, t) {
                return function () {
                    p.value = t.val();
                }
            })(param, textbox));
        }
    }

    activeFunction = func;
}

function ExecuteFunction(func) {
    var args = [];
    for (var i in func.params) {
        args.push(func.params[i].value);
    }

    try {
        var retval = window[func.name].apply(null, args);
        return {ret:retval}
    } catch (e) {
        tps.log.Error(e.toString());
        return { ret: false, error: e.toString() };
    }
}

function showMainpage() {
    window.location.hash = "";
    $("#mainpage").show();
    $("#functionpage").hide();
}

function showFunctionPage() {
    window.location.hash = "functionPage";
    $("#mainpage").hide();
    $("#functionpage").show();
}

/** return:
 *  { summary: <string>, description: <string>, params: { <param name>: {type: <string>, description: <string>, value: <string>} }
 */
function parseJsdoc(doc) {
    // put tag information to `info`
    // return end position
    var parseTag = function (doc, pos, info) {
        if (doc.startsWith("param ", pos)) {
            // @param {type} name description, note that type can span multiple lines
            var brace1 = doc.indexOf("{", pos);
            var brace2 = doc.indexOf("}", pos);
            if (brace1 == -1 || brace2 == -1 || brace1 > brace2) {
                brace1 = 4;
                brace2 = 5;
            }
            var typespec = doc.substr(brace1 + 1, brace2 - brace1 - 1);
            var lineend = doc.indexOf("\n", brace2);
            var nd = doc.substr(brace2 + 1, lineend - brace2 - 1).trim();
            var arr = nd.splitHead(" ");
            var name, desc;
            if (arr) {
                name = arr[0];
                desc = arr[1].trim().replace(/^-\s+/, "");
            } else {
                name = nd;
                desc = "";
            }

            info.params[name] = {
                type: typespec,
                description: desc,
                value: null
            }

            return lineend + 1;
        }
    };

    doc = doc.replace(/\r/g, "");
    doc = doc.replace(/\n[ \t]*\*/igm, "\n");
    doc = doc.replace(/\n[ \t]*/igm, "\n");
    if (!doc.endsWith("\n"))
        doc += "\n";

    var info = { description: "", tags: [], params: {} };
    var desc = "";
    var linestart = true;
    var pos = 0;
    while (pos < doc.length) {
        var ch = doc.charAt(pos);
        if (ch == '@' && linestart) {
            pos = parseTag(doc, pos+1, info);
            continue;
        }
        desc += ch;
        linestart = (ch == '\n');
        pos++;
    }

    var arr = desc.splitHead("\n");
    if (arr) {
        info.summary = arr[0].trim();
        info.description = arr[1].trim();
    } else {
        info.summary = desc;
    }

    return info;
}

function extractJsdocOfFunction(func) {
    var code = func.toString();

    var pos1 = code.indexOf("{", 0);
    if (pos1 == -1)
        return null;

    ++pos1;
    while (isWhiteSpace(code[pos1]))
        ++pos1;

    if (code.substr(pos1, 3) != "/**")
        return null;

    var pos2 = code.indexOf("*/", pos1);
    if (pos2 == -1)
        return null;

    return code.substr(pos1 + 3, pos2 - pos1 - 3);
}

function isWhiteSpace(ch)
{
    return ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r';
}

$(document).ready(function () {
    Main();
});

$(document).on('keypress', '.numeric-only', function (e) {
    if (e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57)) {
        //display error message
        //$("#errmsg").html("Digits Only").show().fadeOut("slow");
        return false;
    }
});

/// hide the ugly focus retangle after user click a button
$(document).click(function () {
    if (document.activeElement.tagName == "BUTTON")
        document.activeElement.blur();
});

$(window).on('hashchange', function () {
    if (!location.hash) {
        showMainpage();
    }
});

