/// <reference path="thirdparty/jquery-2.1.4.min.js" />
/// <reference path="thirdparty/json2.js" />

// TODO: javascript intellisense has problem if visual studio project file is not in root folder.
//       The workaround is to use absolute paths

// tps.sys.RestartHTA(true, true);

var functions = {};
var config = {
    runhistory: {}
};
var configfile = shell ? shell.ExpandEnvironmentStrings("%APPDATA%\\jsrunner\\config.js") : "";

function Main() {
    Init();
    FillFunctionTableWithFilter("");
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

    LoadConfig();
    tps.util.MergeProperty(functions, config.runhistory);

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
        config.runhistory[k] = {params:[]};
        var fr = config.runhistory[k];
        $.each(v.params, function (i, p) {
            fr.params.push({ name: p.name, value: p.value });
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
            .click((function (f) { return function () { ShowFunction(f); }})(func))
            );
    }
}

// returns: [{type:string, value, startPos, endPos}]
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
        } else if (str.substr(pos, 7) == "{@call ") {
            var pos2 = str.indexOf("}", pos);
            if (pos2 != -1) {
                var content = str.substr(pos + 7, pos2 - pos - 7);
                var text = window[content].apply();
                tag = { type: "status", startPos: pos, endPos: pos2 + 1, value: text };
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
        if (tag.type == "text") {
            $div.append($("<span>").text(tag.value));
        } else if (tag.type == "br") {
            $div.append($("<p>"));
        } else if (tag.type == "link") {
            $div.append($("<a>", {
                href: tag.value.url,
                text: tag.value.text
            }));
        } else if (tag.type == "status") {
            $div.append($('<span class="status">').text(tag.value));
        } else if (tag.type == "list") {
            var $ul = $("<ul>");
            $.each(tag.value, function (k, v) {
                $ul.append($("<li>").text(v));
            });
            $div.append($ul);
        }
    }

    return $div;
}

function ShowFunction(func) {
    $("#funcname").text(func.name);
    $("#funcsummary").text(func.summary);
    $("#funcdesc").empty();
    $("#funcdesc").append(createNodeFromJsDoc(func.description));

    $("#paramcontainer").empty();

    for (var i in func.params) {
        var div = $("<div>").addClass("input-group");
        $("#paramcontainer").append(div);

        var param = func.params[i];
        div.append($('<span class="input-group-addon">').text(param.description));

        if (param.type == "string") {
            if (param.value === null) param.value = "";
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
            var textbox = $('<input class="form-control" type="text">').addClass("numeric-only").val(param.value);
            div.append(textbox);
            textbox.on("change", (function (p, t) {
                return function () {
                    p.value = parseInt(t.val());
                }
            })(param, textbox));
        }
        else if (param.type.startsWith("string in ")) {
            var spec = param.type.substr(10).replace(/^\[(.*)\]$/, "$1");
            var slist = [];
            if (spec.endsWith("()")) {
                slist = window[spec.substr(0, spec.length - 2)].apply(null);
            } else {
                slist = spec.split(" ");
            }

            // selection list here
            if (param.value === null) param.value = slist[0];
            var selectbox = $('<select class="form-control">');
            div.append(selectbox);
            $.each(slist, function (k, v) {
                selectbox.append($("<option/>", { value: v, text: v }));
            });
            
            selectbox.val(param.value);
            selectbox.on("change", (function (p, t) {
                return function () {
                    p.value = t.val();
                }
            })(param, selectbox));
        }
    }

    $("#run").unbind("click");
    $("#run").bind("click", function () {
        SaveConfig();
        ExecuteFunction(func);

        // update func description in case there is any status inside it.
        $("#funcdesc").empty();
        $("#funcdesc").append(createNodeFromJsDoc(func.description));
    });

    showFunctionPage();
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
 *  { summary: <string>, description: <string>, params: [] of { name: <string>, type: <string>, description: <string>, value: <string> }
 */
function parseJsdoc(doc) {
    var info = {description:"", params:[]};
    var lines = doc.split("\n");
    for (var i in lines) {
        var line = lines[i].trim();
        line = line.replace(/^\*\s+|^\*$/, "");

        if (line[0] == '@') {
            var paramRegex = /^@param\s+(\{[^}]+\})?\s+(\S+)\s+(.*)$/ig;
            var result = paramRegex.exec(line);
            if (result != null) {
                var param = {
                    name: result[2],
                    type: result[1].replace(/^{(.*)}$/, "$1"),
                    description: result[3].replace(/^-\s+/, ""),
                    value: null
                };
                info.params.push(param);
            }
        }
        else {
            if (!info.summary)
                info.summary = line;
            else {
                info.description += line;
                info.description += "\n";
            }
        }
    }

    info.description = info.description.trim();
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

