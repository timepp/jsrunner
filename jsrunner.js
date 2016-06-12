/// <reference path="thirdparty/jquery-2.1.4.min.js" />

var functions = {};

function Main() {
    Init();
    FillFunctionTableWithFilter("");
}

function Init() {
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
                functions[fn] = info;
            }
        }
    }

    $("#back").click(function () {
        showMainpage();
    });

    $("#funcfilter").keyup(function () {
        FillFunctionTableWithFilter($(this).val());
    });

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

function ShowFunction(func) {
    $("#funcname").text(func.name);
    $("#funcsummary").text(func.summary);
    $("#funcdesc").text(func.description);

    $("#paramcontainer").empty();

    for (var i in func.params) {
        var div = $("<div>").addClass("paramdiv");
        $("#paramcontainer").append(div);

        var param = func.params[i];
        div.append($("<p>").text(param.name + ":" + param.description));
        if (param.type == "string") {
            var textbox = $('<input class="form-control" type="text">');
            div.append(textbox);
            textbox.on("change", (function (p, t) {
                return function() {
                    p.value = t.val();
                }
            })(param, textbox));
        }
        else if (param.type == "number") {
            var textbox = $('<input class="form-control" type="text">').addClass("numeric-only");
            div.append(textbox);
            textbox.on("change", (function (p, t) {
                return function () {
                    p.value = parseInt(t.val());
                }
            })(param, textbox));
        }
    }

    $("#run").unbind("click");
    $("#run").bind("click", function () {
        ExecuteFunction(func);
    });

    showFunctionPage();
}

function ExecuteFunction(func) {
    var args = [];
    for (var i in func.params) {
        args.push(func.params[i].value);
    }
    window[func.name].apply(null, args);
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
            var paramRegex = /^@param\s+(\{\S+\})?\s+(\S+)\s+(.*)$/ig;
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

