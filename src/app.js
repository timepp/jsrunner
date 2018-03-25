/// <reference path="thirdparty/jquery-2.1.4.min.js" />
/// <reference path="thirdparty/json2.js" />
/// <reference path="thirdparty/tps.js" />

// TODO: javascript intellisense has problem if visual studio project file is not in root folder.
//       The workaround is to use absolute paths

var functions = {};
var activeFunction = null;
var config = {
    runhistory: {},
    tagfilter: []
};
var configfile = shell ? shell.ExpandEnvironmentStrings("%APPDATA%\\jsrunner\\config.js") : "";
var logfile = shell ? shell.ExpandEnvironmentStrings("%APPDATA%\\jsrunner\\jsrunnerlog.txt") : "";
var showLegacy = false;

$(function(){ main(); });

function main() {
    /*
    try {
        var result = tps.sys.RestartHTA(tps.sys.processOption.requestAdmin | tps.sys.processOption.escapeWOW64);
        if (result) {
            return;
        }
    } catch (e) { }
    */

    LoadConfig();
    Init();
    RefreshFunction();
    tps.util.UpdateProperty(functions, config.runhistory);

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
}

function callWinapi(dll, func, param){
    var result = winapi.call(dll, func, param);
    return JSON.parse(result);
}

function callWinapiSimple() {
    var dll = arguments[0];
    var func = arguments[1];
    var params = "";
    for (var i = 2; i < arguments.length; i++) {
        if (params != "") params += " ";
        var arg = arguments[i];
        if (typeof arg === "string") {
            params += "wstr:" + arg;
        } else if (typeof arg === "number") {
            params += "int:" + arg;
        }
    }

    return callWinapi(dll, func, params);
}

function Init() {

    functions = GetRunnableFunctions();

    $("#home").click(function () {
        showMainpage();
    });

    $("#back").click(function () {
        showFunctionPage();
    });

    $("#viewlog").click(function () {
        showLogPage();
    });

    $("#funcfilter").keyup(function () {
        RefreshFunction();
    });

    $("#table_layout").click(function () {
        $("#table_layout").removeClass("btn-default").addClass("btn-primary");
        $("#wall_layout").removeClass("btn-primary").addClass("btn-default");
        syncLayout();
    });

    $("#wall_layout").click(function () {
        $("#wall_layout").removeClass("btn-default").addClass("btn-primary");
        $("#table_layout").removeClass("btn-primary").addClass("btn-default");
        syncLayout();
    });

    $("#wall_layout").removeClass("btn-default").addClass("btn-primary");

    $("#run").bind("click", function () {
        $(this).prop("disabled", true);
        SaveConfig();
        $("#result").empty();
        $("#log").empty();
        
        window.setTimeout(function () {
            var result = ExecuteFunction(activeFunction);
            // update func description in case there is any status inside it.
            ShowFunction(activeFunction);
            showExecuteResult(result);
            $("#run").prop("disabled", false);
        }, 10);
    });

    $(document.body).keyup(function (e) {
        if (e.keyCode == 27) {
            showMainpage();
        }
    });

    $(window).resize(function () {
        resizeLogPage();
    });

    try {
        tps.sys.AddToPath(tps.sys.processEnv, tps.sys.GetScriptDir() + "\\thirdparty");
        if (fso.FileExists(logfile)) {
            fso.DeleteFile(logfile);
        }
    } catch (e) { }

    tps.log.AddHtmlElementDevice($("#log")[0]);

    // change icon
    try {
        var result;
        var icon = callWinapiSimple("user32.dll", "LoadImageW", 0, "C:\\src\\jsrunner\\src\\app.ico", 1, 0, 0, 0x10).retval;
        var hwnd = callWinapiSimple("user32.dll", "GetForegroundWindow").retval;
        var parent = callWinapiSimple("user32.dll", "GetWindow", hwnd, 4).retval;
        callWinapiSimple("user32.dll", "SendMessageW", hwnd, 0x80, 1, icon);
        callWinapiSimple("user32.dll", "SendMessageW", hwnd, 0x80, 0, icon);
        callWinapiSimple("user32.dll", "SendMessageW", parent, 0x80, 1, icon);
        callWinapiSimple("user32.dll", "SendMessageW", parent, 0x80, 0, icon);
        winapi = null;
    } catch (e) { }

    initTagFilter();
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
                if (showLegacy || info.tags.indexOf("Legacy") == -1) {
                    info.name = fn;
                    funcs[fn] = info;
                }
            }
        }
    }
    return funcs;
}

function RefreshFunction() {
    var filter = $("#funcfilter").val();
    FillFunctionTableWithFilter(filter);
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

        if (config.tagfilter.length > 0) {
            match = false;
            for (var j in config.tagfilter) {
                if (func.tags.indexOf(config.tagfilter[j]) >= 0) {
                    match = true;
                    break;
                }
            }
        }

        if (match) {
            selected.push(func);
        }
    }

    $('#mainpage .datatable').remove();
    $('#mainpage .freewall').remove();
    $('#mainpage').append(createDataTable(selected));
    $('#mainpage').append(createCoverWall(selected));
    syncLayout();
}

function syncLayout() {
    if ($("#table_layout").hasClass("btn-primary")) {
        $('#mainpage .datatable').show();
        $('#mainpage .freewall').hide();
    } else {
        $('#mainpage .datatable').hide();
        $('#mainpage .freewall').show();
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
        $content = $('<span class="btn-danger form-control">').text("failed" + (result.error? ": " + result.error: ""));
    } else if (result.ret === true) {
        $content = $('<span class="btn-success form-control">').text("succeeded");
    } else {
        $content = createNodeFromData(result.ret);
    }

    $result.append($content);
    $("#resultpanel").show();
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
    $(".funcname").text(func.name);
    $("#funcsummary").text(func.summary);
    $("#funcdesc").empty();
    $("#funcdesc").append(createNodeFromJsDoc(func.description));
    $("#resultpanel").hide();
    $("#paramcontainer").empty();

    var spec = "";
    for (var i in func.params) {
        var div = $("<div>").addClass("input-group").addClass("paramdiv");
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

    if ($("#paramcontainer").children().length > 0) {
        $("#parampanel").show();
    } else {
        $("#parampanel").hide();
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
    $("#logpage").hide();
}

function showFunctionPage() {
    window.location.hash = "functionPage";
    $("#mainpage").hide();
    $("#logpage").hide();
    $("#functionpage").show();
}

function showLogPage() {
    window.location.hash = "logpage";
    $("#functionpage").hide();
    $("#logpage").show();
    resizeLogPage();
}

function resizeLogPage() {
    var h = window.innerHeight;
    var $l = $("#log");
    $l.height(h - 10 - $l.offset().top);
}

/** return:
 *  { summary: <string>, description: <string>, params: { <param name>: {type: <string>, description: <string>, value: <string>} }
 */
function parseJsdoc(doc) {
    // put tag information to `info`
    // return end position
    // return -1 if parse failed
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
        else if (doc.startsWith("see ", pos)) {
            var lineend = doc.indexOf("\n", pos);
            var tags = doc.substr(pos + 4, lineend - pos - 4);
            info.tags = tags.split(";");
            return lineend + 1;
        }

        return -1;
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
            var newpos = parseTag(doc, pos + 1, info);
            if (newpos != -1) {
                pos = newpos;
                continue;
            }
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

function createDataTable(db) {
    var tbl = $('<table>').addClass("table table-striped table-bordered datatable");

    // It's not a good idea to table all properties, we just pick the most useful properties here
    var properties = ["name", "summary"];

    // create thead
    var tr = $('<tr>');
    tbl.append($('<thead>').append(tr));
    for (var i in properties) {
        tr.append($('<th>').text(properties[i]).addClass(properties[i]));
    }

    // create tbody
    var tbody = $('<tbody>');
    tbl.append(tbody);
    for (var i in db) {
        var item = db[i];
        var tr = $('<tr>');
        tbody.append(tr);
        for (var j in properties) {
            var p = properties[j];
            tr.append($('<td>').addClass(p).text(item[p]).addClass(p));
            tr.click((function (f) {
                return function () {
                    if (f.tags.indexOf("direct") >= 0) {
                        ExecuteFunction(f);
                    } else {
                        ShowFunction(f);
                        showFunctionPage();
                    }
                }
            })(item));
        }
    }

    if (db.length > 0) {
        tbl.DataTable({ paging: false, info: false, filter: false, bAutoWidth: false });
    }

    return tbl;
}

function imgError(image) {
    image.onerror = "";
    image.style.display = 'none';
    return true;
}

function hash(s) {
    var hash = 0;
    if (s.length == 0) return hash;
    for (i = 0; i < s.length; i++) {
        char = s.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}

// get a reasonable short name
function getShortName(name) {
    return name;
}

function createCoverWall(db) {
    var wall = $('<div>').addClass("freewall");
    for (var i in db) {
        var item = db[i];
        var figure = $('<figure>').addClass("app");
        var imgpath = "images/" + item.name + ".png";
        var img = $('<img src="' + imgpath + '">');
        img.error(function (o) {
            return function () {
                var colordiv = $('<div>').addClass("appcolorblock");
                var v = hash(o.name);
                var r = v & 0xFF;
                var g = (v >> 8) & 0xFF;
                var b = (v >> 16) & 0xFF;
                var hsl = RGBToHSL(r, g, b);
                //if (hsl[2] < 200) hsl[2] += 55; else hsl[2] -= 55;
                hsl[2] += 55;
                var rgb = HSLToRGB(hsl[0], hsl[1], hsl[2]);
                r2 = Math.round(rgb[0]);
                g2 = Math.round(rgb[1]);
                b2 = Math.round(rgb[2]);
                var rgb1 = "rgb(" + r + "," + g +"," + b + ")";
                var rgb2 = "rgb(" + r2 + "," + g2 +"," + b2 + ")";
                //colordiv.css("background-color",  );
                colordiv.css("background", "linear-gradient(to bottom right, " + rgb1 + ", " + rgb2 + ")");
                $(this).parent().prepend(colordiv);
                $(this).hide();
            }
        }(item));
        figure.append(img);
        var caption = $('<figcaption>');
        caption.append(getShortName(item.name));
        figure.append(caption);
        wall.append(figure);

        figure.click((function (f) {
            return function () {
                if (f.tags.indexOf("direct") >= 0) {
                    ExecuteFunction(f);
                } else {
                    ShowFunction(f);
                    showFunctionPage();
                }
            }
        })(item));
    }
    return wall;
}

function RGBToHSL(r, g, b) {
    var
	min = Math.min(r, g, b),
	max = Math.max(r, g, b),
	diff = max - min,
	h = 0, s = 0, l = (min + max) / 2;

    if (diff != 0) {
        s = l < 0.5 ? diff / (max + min) : diff / (2 - max - min);

        h = (r == max ? (g - b) / diff : g == max ? 2 + (b - r) / diff : 4 + (r - g) / diff) * 60;
    }

    return [h, s, l];
}

function HSLToRGB(h, s, l) {
    if (s == 0) {
        return [l, l, l];
    }

    var temp2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var temp1 = 2 * l - temp2;

    h /= 360;

    var
	rtemp = (h + 1 / 3) % 1,
	gtemp = h,
	btemp = (h + 2 / 3) % 1,
	rgb = [rtemp, gtemp, btemp],
	i = 0;

    for (; i < 3; ++i) {
        rgb[i] = rgb[i] < 1 / 6 ? temp1 + (temp2 - temp1) * 6 * rgb[i] : rgb[i] < 1 / 2 ? temp2 : rgb[i] < 2 / 3 ? temp1 + (temp2 - temp1) * 6 * (2 / 3 - rgb[i]) : temp1;
    }

    return rgb;
}


function updateTagHitCounts(db) {
    $('#tagfilter > div').each(function() {
        var count = 0;
        var tag = $(this).data("tag");
        for (var i in db) {
            var item = db[i];
            var ts = item.tags.split(" ");
            if (ts.indexOf(tag) >= 0) count++;
        }
        $(this).find(".count").text("(" + count + ")");
    });
}

function initTagFilter() {
    var div = $('#tagfilter');
    var tags = {};

    $.each(functions, function (k, v) {
        $.each(v.tags, function (i, t) {
            tags[t] = 1;
        });
    });

    for (var i in config.tagfilter) {
        var tag = config.tagfilter[i];
        if (!(tag in tags))
            removeFromArray(config.tagfilter, tag);
    }
    SaveConfig();

    for (var t in tags) {
        var s = $('<div class="tag">');
        s.append($('<div class="glyphicon glyphicon-tag tagimg"/>'));
        s.append(t);
        s.append($('<div class="count">'));
        if (config.tagfilter.indexOf(t) >= 0) {
            s.addClass("selected");
        }

        s.data("tag", t);
        s.on("click", function() {
            $(this).toggleClass("selected");
            if ($(this).hasClass("selected")) {
                config.tagfilter.push($(this).data("tag"));
            }
            else {
                removeFromArray(config.tagfilter, $(this).data("tag"));
            }
            SaveConfig();
            RefreshFunction();
        });

        div.append(s);
        div.append($('<div class="tagspacer">'));
    }

    layoutTagFilters();
    $(window).resize(function(){
        layoutTagFilters();
    });
}

function layoutTagFilters() {
    var div = $('#tagfilter');
    // div.width() will return a rounded value, which sometimes is not accurate
    var w = div[0].getBoundingClientRect().width;
    var tags = div.find(".tag");
    var spacers = div.find(".tagspacer");
    var e = tags.outerWidth();

    spacers.show();

    // e * cols + (cols-1) * 5 < w
    var cols = Math.floor((w + 5) / (e + 5));
    if (cols == 0) {
        spacers.width(0);
        spacers.hide();
        return;
    } else if (cols == 1) {
        // set spacer width + tag width == w - 1 to make sure line break
        spacers.width(w - 1 - e);
        return;
    }

    var totalspace = w - e * cols;
    var count = tags.length;
    var singlespace = Math.floor(totalspace / (cols - 1));
    var reminder = totalspace % (cols - 1);

    console.log("div resize: " + w + "," + e);
    console.log("cols: "+ cols + ", spaces: " + totalspace + "," + singlespace);

    for (var i = 0; i < count; i++) {
        var col = i % cols;
        var space = singlespace;
        if (col == cols - 1) {
            space = 0;
        } else if (col >= cols - 1 - reminder) {
            space = singlespace + 1;
        }

        spacers.eq(i).width(space);
    }
}

function removeFromArray(a, b) { 
    var pos = a.indexOf(b);
    if (pos >= 0) {
        a.splice(pos, 1); 
        return true; 
    } 
    return false;
}
