/// <reference path="thirdparty/jquery-2.1.4.min.js" />
/// <reference path="thirdparty/json2.js" />

// TODO: javascript intellisense has problem if visual studio project file is not in root folder.
//       The workaround is to use absolute paths

//tps.sys.RestartHTA(true, true);

var functions = {};
var activeFunction = null;
var config = {
    runhistory: {}
};
var configfile = shell ? shell.ExpandEnvironmentStrings("%APPDATA%\\jsrunner\\config.js") : "";

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

    $("#clearlog").click(function () {
        $("#log").empty();
    });

    $("#funcfilter").keyup(function () {
        FillFunctionTableWithFilter($(this).val());
    });

    $("#run").bind("click", function () {
        $(this).prop("disabled", true);
        SaveConfig();
        ExecuteFunction(activeFunction);

        // update func description in case there is any status inside it.
        ShowFunction(activeFunction);
        $(this).prop("disabled", false);
    });


    try {
        tps.sys.AddToPath(tps.sys.processEnv, tps.sys.GetScriptDir() + "\\thirdparty");
    } catch (e) { }

    tps.log.AddHtmlElementDevice($("#log")[0]);
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
        var func = functions[fn];
        if (filters.length == 0) {
            selected.push(func);
        } else {
            for (var i in filters) {
                var f = filters[i];
                if (func.name.toLowerCase().indexOf(f) != -1 ||
                    func.summary.toLowerCase().indexOf(f) != -1 ||
                    func.description.toLowerCase().indexOf(f) != -1) {
                    selected.push(func);
                    break;
                }
            }
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
        window[func.name].apply(null, args);
    } catch (e) {
        tps.log.Error(e.toString());
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
    var cleandoc = doc.replace(/\r/g, "");
    cleandoc = cleandoc.replace(/\n[ \t]*\*/igm, "\n");
    cleandoc = cleandoc.replace(/\n[ \t]*/igm, "\n");
    if (!cleandoc.endsWith("\n"))
        cleandoc += "\n";

    var info = { description: "", params: {} };
    var paramRegex = /\n@param +(\{[^}]+\})? +(\S+) +([^\n]*)\n/igm;
    var desc = "";
    var startPos = 0;
    var result;
    while ((result = paramRegex.exec(cleandoc)) !== null) {
        if (startPos < result.index) {
            desc += cleandoc.substr(startPos, result.index);
        }
        startPos = paramRegex.lastIndex;
        paramRegex.lastIndex--; // we matched both start "\n" and end "\n", here we need to step back
        info.params[result[2]] = {
            type: tps.util.RemoveQuote(result[1]),
            description: result[3].replace(/^-\s+/, ""),
            value: null
        };
    }

    if (startPos < cleandoc.length)
        desc += cleandoc.substr(startPos);

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

