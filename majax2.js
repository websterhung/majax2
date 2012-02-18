/*
 *   MAJAX - The Millennium AJAX Library
 *
 *   MAJAX 2.0
 *
 *   Copyright 2009 by Godmar Back godmar@gmail.com 
 *   and Annette Bailey, Virginia Tech.
 *
 *   License: This software is released under the LGPL license,
 *   See http://www.gnu.org/licenses/lgpl.txt
 *
 *   $Id$
 *
 *   Instructions:
 *   ------------
 *   This file must be placed into the /screens directory of a III
 *   Millennium installation.   Subsequently, other webpages can 
 *   include this file to make AJAX calls to the Millennium system.
 *
 */

/* To customize, either change this section of the file, or create 
 * your own .js file and include that before or after majax.js.
 * The file you create should look like this:
 *
 * var noCopiesFound = "We don't have this item";
 *
 * with entries for all message you wish to customize.
 */

(function (majax2ServiceUrl, majax2OpacBase) {

/* 
 * URL to the MAJAX2 proxy.
 */
if (!majax2ServiceUrl)
    majax2ServiceUrl = "http://libx.lib.vt.edu/services/majax2/";

/* 
 * III OpacBase.
 */
if (!majax2OpacBase)
    majax2OpacBase = "http://addison.vt.edu/search";

/*****************************************************************/
/* A regular expression that is matched against a status to determine if
 * an item should count as available.
 */
if (!isAvailableRegex)
    var isAvailableRegex = /AVAILABLE/;

/* 
 * Messages used by majax-showholdings 
 * showholdings always reports on the status of all copies found.
 */
if (!noCopiesFound) 
    var noCopiesFound = "No copies found."; 

/* 1 copy was found, say what it's status is. */
if (!singleCopyStatus)
    var singleCopyStatus = "1 copy is %s";

/* If multiple copies were found, say how many and what their statuses are. */
/* %n is substituted with how many. */
/* %s is substituted with a comma-separated list of statuses. */
if (!multipleCopyStatus)
    var multipleCopyStatus = "%n copies found: %s";

/*****************************************************************/
/* Messages used by majax-showholdings-brief  - showholdings brief
 * says that it's available if at least 1 copy is available.
 */
if (!itemAvailableMsg) 
    var itemAvailableMsg = "This item is available";

/* If no copy was found (this is suppressed if 856$u is present.) */
if (!noCopyHeld)
    var noCopyHeld = "No copy held";

/* If 1 copy was found, but it's not available. */
if (!singleItemUnavailable)
    var singleItemUnavailable = "This item is %s";

/* If >1 copy was found, but none is available. */
if (!multipleItemsUnavailable)
    var multipleItemsUnavailable = "No copy currently available (copies are %s)";

/* message shown in majax-ebook */
var electronicBookMsg = "[Electronic Book]";

// base url to use for syndetics book cover service
// tn says they were told to use index.aspx
// previously, we used
//    var syndeticsBase = "http://syndetics.com/hw7.pl";
// adjust if necessary
if (!syndeticsBase)
    var syndeticsBase = "http://syndetics.com/index.aspx";

/*****************************************************************/
/*
 * Add an event handler, browser-compatible.
 * This code taken from http://www.dustindiaz.com/rock-solid-addevent/
 * See also http://www.quirksmode.org/js/events_compinfo.html
 *          http://novemberborn.net/javascript/event-cache
 */
function addEvent( obj, type, fn ) {
        if (obj.addEventListener) {
                obj.addEventListener( type, fn, false );
                EventCache.add(obj, type, fn);
        }
        else if (obj.attachEvent) {
                obj["e"+type+fn] = fn;
                obj[type+fn] = function() { obj["e"+type+fn]( window.event ); }
                obj.attachEvent( "on"+type, obj[type+fn] );
                EventCache.add(obj, type, fn);
        }
        else {
                obj["on"+type] = obj["e"+type+fn];
        }
}

/* unload all event handlers on page unload to avoid memory leaks */
var EventCache = function(){
        var listEvents = [];
        return {
                listEvents : listEvents,
                add : function(node, sEventName, fHandler){
                        listEvents.push(arguments);
                },
                flush : function(){
                        var i, item;
                        for(i = listEvents.length - 1; i >= 0; i = i - 1){
                                item = listEvents[i];
                                if(item[0].removeEventListener){
                                        item[0].removeEventListener(item[1], item[2], item[3]);
                                };
                                if(item[1].substring(0, 2) != "on"){
                                        item[1] = "on" + item[1];
                                };
                                if(item[0].detachEvent){
                                        item[0].detachEvent(item[1], item[2]);
                                };
                                item[0][item[1]] = null;
                        };
                }
        };
}();
addEvent(window,'unload',EventCache.flush);
// end of rock-solid addEvent

// Begin MAJAX code

// majax2OpacBase = "http://library.naperville-lib.org/search";
// majax2OpacBase = "http://library.ccbcmd.edu/search";
// majax2OpacBase = "http://library.tufts.edu/search";
// majax2OpacBase = "http://laurel.lib.vt.edu/search";
// majax2OpacBase = "http://www.library.lafayette.edu/search";
// majax2OpacBase = "http://catalogue.wellcome.ac.uk:2082/search";

/* Global majax object */
majax = {
    isReady: false,
    readyListeners: [ ],
    ready : function () {
        if (this.isReady)
            return;

        this.isReady = true;

        for (var i = 0; i < this.readyListeners.length; i++) {
            this.readyListeners[i]();
        }
    }
};

// XXX don't change String.prototype
String.prototype.trim = function() { 
    return this.replace(/^\s+|\s+$/g, ''); 
};

function majaxProcessRemainingSpans(spanElems) {
    var requestsSentToServer = 0;
    while (spanElems.length > 0) {
        var spanElem = spanElems.pop();
        if (spanElem.expanded)
            continue;

        var cName = spanElem.className;
        if (cName == null)
            continue;

        var mReq = {
            span: spanElem, 
            removeTitle: function () {
                this.span.setAttribute('title', '');
            },
            success: new Array(),
            failure: new Array(),
            onsuccess: function (data) {
                if (data.results.length > 0) {
                    for (var i = 0; i < this.success.length; i++)
                        try {
                            this.success[i](this, data.results[0]);
                        } catch (er) { }
                } else {
                    for (var i = 0; i < this.failure.length; i++)
                        try {
                            this.failure[i](this);
                        } catch (er) { }
                }
                this.removeTitle();
            },
            /* get the search item that's sent to III
             * The search term may be in the title, or in the body.
             * It's in the body if the title contains a "*".
             * Example:  
             *           <span title="i0123456789"></span>
             *           <span title="i*">0123456789</span>
             */
            getSearchItem: function () {
                if (this.searchitem === undefined) {
                    var m, req = this.span.getAttribute('title');
                    if ((m = req.match(/^(o|i|t|\.b)\*$/)) != null) {
                        var text = this.span.innerText || this.span.textContent || "";
                        text = text.trim().toLowerCase();
                        // ignore surrounding content for ISBN which can occur in 020$a fields
                        // such as in 1412936373 (cloth)
                        if (m[1] == "i") {
                            var m2 = text.match(/((\d|x|X){10,13})/);
                            if (m2) {
                                text = m2[1];
                            }
                        }
                        this.searchitem = m[1] + text;

                        // remove children and make sure <span> is visible
                        while (this.span.hasChildNodes())
                            this.span.removeChild(this.span.firstChild);
                        this.span.style.display = "inline";
                    } else
                        this.searchitem = req.toLowerCase();
                }
                return this.searchitem;
            },
            printSearchItem: function () {
                var m, req = this.searchitem;
                if ((m = req.match(/^o(\S*)/)) != null)
                    return "OCLC# '" + m[1] + "'";
                else if ((m = req.match(/^i(\S*)/)) != null)
                    return "ISBN '" + m[1] + "'";
                else if ((m = req.match(/^t(\S*)/)) != null)
                    return "Title '" + m[1] + "'";
                else if ((m = req.match(/^\.(b\S*)/)) != null)
                    return "Bibrecord '" + m[1] + "'";
                return
                    return "illegal majax request: " + req;
            }
        };

        function addHandler(majaxClass, mReq) {
            // insert field datafield/subfield only
            var m = majaxClass.match(/majax-marc-(\d\d\d)-(\S)/);
            if (m == null) {
                m = majaxClass.match(/majax-marc-(\d\d\d)/);
            }
            if (m) {
                mReq.success.push(function (mReq, result) {
                    var msg = null;
                    var dfield = result.marc['f' + m[1]];
                    if (dfield == null)
                        return;

                    if (m[2]) {         // m[2] is MARC subfield
                        var d = dfield[m[2]];
                        if (d !== undefined)
                            msg = d + " ";
                    } else {
                        var _1 = "abcdefghijklmnopqrstuvwxyz0123456789";
                        msg = "";
                        for (var i = 0; i < _1.length; i++) {
                            var d = dfield[_1.charAt(i)];
                            if (d !== undefined)
                                msg += d + " ";
                        }
                    }
                    if (msg != null) {
                        msg = msg.replace(/&#59;/g, ";");
                        mReq.span.appendChild(document.createTextNode(msg));
                    }
                });
                return true;
            }

            var ms = majaxClass.match(/majax-syndetics-(\S+)/i);
            if (ms) {
                var clientid = ms[1];
                mReq.success.push(function (mReq, result) {
                    // link to syndetics based on record's ISBN
                    var isbn = result.marc.f020.a.match(/((\d|x){10,13})/i);
                    isbn = isbn[1];

                    var img = document.createElement("img");
                    img.setAttribute('src', syndeticsBase 
                            + "?isbn=" + isbn 
                            + "/SC.GIF&client=" + clientid);
                    mReq.span.appendChild(img);
                });
                return true;
            }

            /* Output holdings and, optionally, locations. */
            function showHoldingsAndLocations(mReq, result, showLocations) {
                var msg = "";
                var isAvailable = false;
                for (var i = 0; i < result.holdings.length; i++) {
                    msg += (i == 0 ? "" : ", ") + result.holdings[i].toLowerCase();
                    if (showLocations && result.locations[i]) {
                        msg += " ("+result.locations[i]+") ";
                    }
                    if (result.holdings[i].match(isAvailableRegex)) {
                        isAvailable = true;
                    }
                }
                switch (result.holdings.length) {
                case 0:
                    msg = noCopiesFound;
                    if (result.marc.f856 && result.marc.f856.u)
                        msg = "";
                    break;
                case 1:
                    msg = singleCopyStatus.replace(/%s/, msg);
                    break;
                default:
                    msg = multipleCopyStatus.replace(/%n/, result.holdings.length).replace(/%s/, msg);
                    break;
                }
                mReq.span.appendChild(document.createTextNode(msg));
                // XXX: if !isAvailable && bibnumber given, add request button
            }

            switch (majaxClass) {
            case "majax-showholdings-div":
            case "majax-shd":
                mReq.success.push(function (mReq, result) {
                    var divHTML = "";
                    for (var i = 0; i < result.holdings.length; i++) {
                        divHTML += "Copy " + (i+1) + ": " 
                                + result.holdings[i].toLowerCase() + "<br />";
                    }
                    var div = document.createElement("div");
                    div.innerHTML = divHTML;
                    mReq.span.appendChild(div);
                });
                break;

            case "majax-newline":
            case "majax-nl":
                mReq.success.push(function (mReq, result) {
                    mReq.span.appendChild(document.createElement("br"));
                });
                break;

            case "majax-space":
            case "majax-s":
                mReq.success.push(function (mReq, result) {
                    mReq.span.appendChild(document.createTextNode(" "));
                });
                break;

            case "majax-showholdings-brief":
            case "majax-shb":
                mReq.success.push(function (mReq, result) {
                    var isAvailable = false;
                    var msg = "";
                    for (var i = 0; i < result.holdings.length; i++) {
                        if (result.holdings[i].match(isAvailableRegex))
                            isAvailable = true;
                        msg += (i == 0 ? "" : " ") + result.holdings[i].toLowerCase();
                    }
                    if (isAvailable) {
                        msg = itemAvailableMsg;
                    } else {
                        switch (result.holdings.length) {
                        case 1:
                            msg = singleItemUnavailable.replace(/%s/, msg);
                            break;
                        case 0:
                            msg = noCopyHeld;
                            if (result.marc.f856 && result.marc.f856.u)
                                msg = "";
                            break;
                        default:
                            msg = multipleItemsUnavailable.replace(/%s/, msg);
                            break;
                        }
                    }
                    mReq.span.appendChild(document.createTextNode(msg));
                });
                break;

            // TN - show holdings with locations in parentheses
            // example: 1 copy is in library (Webster 4th Floor) 
            case "majax-showholdingslocations":
            case "majax-shl":
                mReq.success.push(function (mReq, result) {
                    showHoldingsAndLocations(mReq, result, true);
                });
                break;

            case "majax-showholdings":
            case "majax-sh":
                mReq.success.push(function (mReq, result) {
                    showHoldingsAndLocations(mReq, result, false);
                });
                break;

            case "majax-reportfailure":
            case "majax-rf":
                mReq.failure.push(function (mReq, status) {
                    var msg = mReq.printSearchItem() + " not found";
                    mReq.span.appendChild(document.createTextNode(msg));
                });
                break;

            case "majax-endnote":
            case "majax-en":
                mReq.success.push(function (mReq, result) {
                    var p = document.createElement("PRE");
                    p.className += "majax-endnote-style";
                    p.appendChild(document.createTextNode(result.endnote));
                    mReq.span.appendChild(p);
                });
                break;

            case "majax-endnote-switch":
            case "majax-ens":
                mReq.success.push(function (mReq, result) {
                    var p = result.majaxMakeEndnoteDisplay(document, 
                            " Endnote", "Show", "Hide", "majax-endnote-style");
                    mReq.span.appendChild(p);
                });
                break;

            case "majax-harvard-reference":
            case "majax-hr":
                mReq.success.push(function (mReq, result) {
                    mReq.span.innerHTML += result.majaxMakeHarvardReference();
                });
                break;

            case "majax-endnote-import":
            case "majax-eni":
                mReq.success.push(function (mReq, result) {
                    var a = result.majaxMakeEndnoteImport(document);
                    a.appendChild(document.createTextNode("Click here to import into EndNote"));
                    mReq.span.appendChild(a);
                });
                break;

            case "majax-ebook":
            case "majax-eb":
                mReq.success.push(function (mReq, result) {
                    try {
                        // do not consider this an electronic book if there is a 856|3.
                        // TBD: implement http://roytennant.com/proto/856/analysis.html
                        if (result.marc.f856.subfields['3'] != null) {
                            return;
                        }
                        var a = document.createElement("a");
                        a.setAttribute("href", result.marc.f856.u);
                        a.appendChild(document.createTextNode(electronicBookMsg));
                        mReq.span.appendChild(a);
                    } catch (er) { }
                });
                break;

            case "majax-linktocatalog":
            case "majax-l":
                mReq.success.push(function (mReq, result) {
                    var p = mReq.span.parentNode;
                    var s = mReq.span.nextSibling;
                    p.removeChild(mReq.span);
                    var a = document.createElement("a");
                    a.setAttribute("href", majaxSearchURL(mReq.getSearchItem()));
                    a.appendChild(mReq.span);
                    p.insertBefore(a, s);
                });
                break;

            default:
                return false;
            }
            return true;
        }

        var hasMajax = false;
        var classEntries = cName.split(/\s+/);
        for (var i = 0; i < classEntries.length; i++) {
            if (addHandler(classEntries[i], mReq))
                hasMajax = true;
        }

        if (!hasMajax)
            continue;

        mReq.span.expanded = true;      // optimistically

        // majaxSearch returns true if the search could not be filled from the cache
        // and thus required that a request was sent to the server.
        if (majaxSearch(mReq.getSearchItem(), mReq))
            requestsSentToServer++;

        // send up to 5 requests every 50ms, that's 5 * 20 = 100 per second.
        // tune these numbers if you feel comfortable doing so.
        // note that MAJAX will only send 1 request per search term,
        // no matter how many spans contain the search term.
        if (requestsSentToServer >= 5) {
            window.setTimeout(function () {
                majaxProcessRemainingSpans(spanElems);
            }, 50);
            return;
        }
    }
}

function majaxProcessSpans() {
    var span = document.getElementsByTagName("span");
    var spanElems = new Array();
    for (var i = 0; i < span.length; i++) {
        spanElems[i] = span[span.length - 1 - i];
    }
    majaxProcessRemainingSpans(spanElems);
}

// commence majax processing
function majaxLoaded() {
    majax.debug = false;
    majaxProcessSpans();
}

// ---------------------------------------------------------------------------

/* Parse XMLHttp result from catalog, return parsed result as Javascript object */
function addLegacyMethodsToResult(result)
{
    var marc = result.marc;

    function expandHTMLEntities(s) {
        // XXX handle all entities
        return s.replace(/&#59;/g, ";").replace(/&#34;/g, '"');
    }

    /* Create EndNote format */

    /* Example:
    %A Levitt, Steven D.
    %D c2005.
    %T Freakonomics : a rogue economist explores the hidden side of everything
    %E Dubner, Stephen J.
    %C New York :
    %I William Morrow,
    %V xii, 242 p. ;
    %N HB74.P8 L479 2005
    %Y Dubner, Stephen J.
    %7 1st ed.
    %@ 006073132X
    %3 Economics -- Psychological aspects.
    %3 Economics -- Sociological aspects.
    */
    try {
        // unsubstitute HTML entities, then
        // remove trailing periods, commas, colons etc.
        function clean(s) {
            return expandHTMLEntities(s).replace(/[;,.: \/]+$/g, "").trim();
        }
        function clean2(s) {    // does not remove periods to leave initials intact
            return s.replace(/[;,: \/]+$/g, "").trim();
        }
        var o = "";
        if (marc.f100 && marc.f100.a) o += "\n%A " + clean2(marc.f100.a);
        if (marc.f260 && marc.f260.c) o += "\n%D " + clean(marc.f260.c);
        if (marc.f245 && marc.f245.a) o += "\n%T " + (marc.f245.a);
        if (marc.f245 && marc.f245.b) o += " " + clean(marc.f245.b);
        if (marc.f700 && marc.f700.a) o += "\n%E " + clean2(marc.f700.a);
        if (marc.f260 && marc.f260.a) o += "\n%C " + clean(marc.f260.a);
        if (marc.f260 && marc.f260.b) o += "\n%I " + clean(marc.f260.b);
        if (marc.f300 && marc.f300.a) o += "\n%V " + clean(marc.f300.a);
        if (marc.f050 && marc.f050.a) o += "\n%N " + clean(marc.f050.a);
        if (marc.f050 && marc.f050.b) o += " " + clean(marc.f050.b);
        if (marc.f700 && marc.f700.a) o += "\n%Y " + (marc.f700.a);
        if (marc.f250 && marc.f250.a) o += "\n%7 " + clean(marc.f250.a);
        if (marc.f020 && marc.f020.a) o += "\n%@ " + clean(marc.f020.a);
        if (marc.f776) {
            o += "\n%K";
            if(marc.f776.c) o += " " + clean(marc.f776.c);
            if(marc.f776.z) o += " " + clean(marc.f776.z);
            for (var j = 0; j < marc.f776.subfields.w.length; j++) {
                o += " " + clean(marc.f776.subfields.w[j]);
            }
        }
        if (marc.f856) {
            if (marc.f856.z) {
                o += "\n%4 " + clean(marc.f856.z);
            }
            if (marc.f856.u) {
                o += "\n%U " + clean(marc.f856.u);      // URL
            }
        }
        for (var i = 0; marc.datafield650 && i < marc.datafield650.length; i++) {
            o += "\n%3 " + clean(marc.datafield650[i].a);
            if (marc.datafield650[i].x) o += " -- " + clean(marc.datafield650[i].x);
            if (marc.datafield650[i].z) o += " -- " + clean(marc.datafield650[i].z);
        }
        // TBD: %O, %K - what do these mean?
        // NB: we use CRLF such that IE can convert them directly into TextNodes 
        result.endnote = o.replace(/^\n/m, "").replace(/\n/g, "\n\r");
    } catch (er) {
        result.endnoteerror = "majax: error occurred during conversion to EndNote format: " + er;
    }
    result.majaxMakeEndnoteDisplay = majaxMakeEndnoteDisplay;
    result.majaxMakeHarvardReference = majaxMakeHarvardReference;

    result.majaxMakeEndnoteImport = function (doc, anchor) {    // anchor is optional
        var ptext = this.endnote.replace(/\n/g, "\n\r");
        if (anchor == null) anchor = doc.createElement("A");
        anchor.setAttribute("href", "data:application/x-endnote-refer," + escape(ptext));
        return anchor;
    }
    return result;
}

function majaxSearchURL (sterm) {
    var bibcheck = sterm.match(/\.(b\d*)/);
    if (bibcheck != null) {
        return majax2OpacBase.replace(/search/, "") + "record=" + bibcheck[1];
    } else {
        return majax2OpacBase + "/" + sterm;
    }
}

// completed requests
// sterm -> {status: ...., result: .... }
var majaxCache =  { }

// pending requests
// sterm -> [ req0, req1, ... ]
var majaxPending = { }

/*
 * Return true if a request was sent to server (can be used for
 * load balancing purposes by caller.)
 *
 * If a search request is already pending, queues the request object
 * Caches both successful and unsuccessful searches.
 */
function majaxSearch(sterm, majaxRequest)
{
    // check if a search is already pending - if so, queue this request
    // so it will be processed when the search completes.
    if (majaxPending[sterm] !== undefined) {
        majaxPending[sterm].push(majaxRequest);
        return false;
    }

    // check in cache to see if the search was done already.
    var cacheentry = majaxCache[sterm];
    if (cacheentry !== undefined && cacheentry.data !== undefined) {
        majaxRequest.onsuccess(cacheentry.data);
        return false;
    }

    switch (sterm.charAt(0)) {
        case "o": var path = "oclc/" + sterm.substring(1); break;
        case "i": var path = "isbn/" + sterm.substring(1); break;
        case "t": var path = "title/" + sterm.substring(1); break;
        case ".": var path = "bibrecord/" + sterm.substring(2); break;
        default: return false;
    }

    var url = majax2ServiceUrl + path;
    url += "?opacbase=" + encodeURIComponent(majax2OpacBase);
    url += "&jsoncallback=majax.processResults";

    if (majax.debug) {
        window.open(url);
    }
    majaxPending[sterm] = [ majaxRequest ];
    loadJSONFunction(url);
    return true;
}

majax.processResults = function (data) 
{
    // 
    // Convert majax2 data into majax1 form to avoid changes to rest of code
    //
    // majax2 JSON result is different from majax1 representation; 
    // It does not contain the 'fXXX' shortcuts, and it doesn't have the
    // fXXX.a shortcuts for the first subfield occurrence. (These are
    // aliases that cannot be expressed in JSON.)
    //
    // In addition, to keep bandwidth down, shorter fieldnames were
    // used.
    // 
    for (var i = 0; i < data.results.length; i++) {
        var marc = data.results[i].marc;
        var marc2 = { };
        for (var fcode in marc) {
            if (!fcode.match(/^\d\d\d$/)) {
                continue;
            }

            var f = marc[fcode];
            var marc2fields = [ ];

            for (var j = 0; j < f.length; j++) {
                var marcfield = f[j];
                var newmarcfield = {
                    ind1 : marcfield.i1, 
                    ind2 : marcfield.i2, 
                    subfields : marcfield.sf
                };

                marc2fields.push(newmarcfield);

                for (var sfcode in newmarcfield.subfields) {
                    if (newmarcfield.subfields[sfcode].length > 0) {
                        marc2fields[j][sfcode] = newmarcfield.subfields[sfcode][0];
                    }
                }
            }

            marc2['datafield' + fcode] = marc2fields;
            if (f.length > 0) {
                marc2['f' + fcode] = marc2['datafield' + fcode][0];
            }

        }
        data.results[i].marc = marc2;
        addLegacyMethodsToResult(data.results[i]);
    }

    // request completed.  Record status in cache.
    // if successful, also record result in cache.
    // notify all pending requests and clear pending
    // queue for this search term.
    var sterm = data.searchterm;
    majaxCache[sterm] = { data: data };

    var pending = majaxPending[sterm];
    for (var i = 0; i < pending.length; i++) {
        pending[i].onsuccess(data);
    }
    delete majaxPending[sterm];
}

/*
 From:
 http://www.howtowritetermpapers.com/harvard.htm

 To reference a book, the details required in order are:

    * Name/s of author/s, editor/s, compiler/s or the institution responsible
    * Year of publication
    * Title of publication
    * Series title and individual volume if applicable
    * Edition if other than first
    * Place of publication
    * Publisher
    * Page number(s) if applicable
 */
function majaxMakeHarvardReference()
{
    var marc = this.marc;
    var o = "";
    if (marc.f100 && marc.f100.a)
        o += marc.f100.a.replace(/[, ]+$/g, "") + ", ";
    for (var i = 0; marc.datafield700 && i < marc.datafield700.length; i++) {
        if (marc.datafield700[i].a) {
            o += marc.datafield700[i].a.replace(/[, ]+$/g, "") + ", ";
        }
    }
    if (marc.f260 && marc.f260.c)
        o += marc.f260.c.replace(/^c/, "").replace(/\.$/,"") + ", ";
    o += '<i>';
    if (marc.f245 && marc.f245.a) {
        o += marc.f245.a;
        if (marc.f245.b)
            o += " " + marc.f245.b;
    }
    o += '</i> ';
    if (marc.f250 && marc.f250.a)
        o += marc.f250.a + ", ";
    if (marc.f260 && marc.f260.a) {
        o += marc.f260.a.replace(/[ :]+$/g, "") + ", ";
        if (marc.f260.b)
            o += marc.f260.b.replace(/[ ,]+$/g, "") + ", ";
    }
    if (marc.f300 && marc.f300.a)
        o += marc.f300.a.replace(/[ :]+$/g, "") + ", ";
    return o.replace(/, $/, "");
}

/*
 * Create a DIV element that enclosed a Show/Hide anchor
 * and embeds the endnote display in an PRE inside an 
 * inner div. 
 */
function majaxMakeEndnoteDisplay(doc, labelText, showText, hideText, preclass)
{
    var p = doc.createElement("PRE");
    if (preclass != undefined)
        p.className = preclass;

    var ptext = this.endnote;
    p.appendChild(doc.createTextNode(ptext));

    var innerdiv = doc.createElement("DIV");
    innerdiv.style.display = 'none';
    innerdiv.appendChild(p);

    var a = doc.createElement("A");
    var t = doc.createTextNode(showText);
    a.appendChild(t);
    a.setAttribute("href", "javascript:;");
    var oc = function (event) { 
        var label;
        if (innerdiv.style.display == "block") {
            innerdiv.style.display = "none";
            label = showText;
        } else {
            innerdiv.style.display = "block";
            label = hideText;
        }
        a.removeChild(a.firstChild);
        var t = doc.createTextNode(label);
        a.insertBefore(t, a.firstChild);
        return false;
    };
    // a.onclick seems to not work in FF 1.5.0.4
    // and IE does not have addEventListener
    if (a.addEventListener)
        a.addEventListener("click", oc, false);
    else
        a.onclick = oc;

    var outerdiv = doc.createElement("DIV");
    outerdiv.appendChild(a);
    var s;
    s = doc.createElement("SPAN");
    s.innerHTML = "&nbsp;" + labelText;
    outerdiv.appendChild(s);
    outerdiv.appendChild(innerdiv);
    return outerdiv;
}

// -------------------------------------------------------------
//
//

/**
 * Browser sniffing and document.ready code taken from jQuery.
 *
 * Source: jQuery (jquery.com) 
 * Copyright (c) 2008 John Resig (jquery.com)
 */
var userAgent = navigator.userAgent.toLowerCase();

// Figure out what browser is being used
majax.browser = {
	version: (userAgent.match( /.+(?:rv|it|ra|ie)[\/: ]([\d.]+)/ ) || [])[1],
	safari: /webkit/.test( userAgent ),
	opera: /opera/.test( userAgent ),
	msie: /msie/.test( userAgent ) && !/opera/.test( userAgent ),
	mozilla: /mozilla/.test( userAgent ) && !/(compatible|webkit)/.test( userAgent )
};

function bindReady() {
	// Mozilla, Opera (see further below for it) and webkit nightlies currently support this event
	if ( document.addEventListener && !majax.browser.opera)
		// Use the handy event callback
		document.addEventListener( "DOMContentLoaded", function () { majax.ready(); }, false );
	
	// If IE is used and is not in a frame
	// Continually check to see if the document is ready
	if ( majax.browser.msie && window == top ) (function(){
		if (majax.isReady) return;
		try {
			// If IE is used, use the trick by Diego Perini
			// http://javascript.nwbox.com/IEContentLoaded/
			document.documentElement.doScroll("left");
		} catch( error ) {
			setTimeout( arguments.callee, 0 );
			return;
		}
		// and execute any waiting functions
		majax.ready();
	})();

	if ( majax.browser.opera )
		document.addEventListener( "DOMContentLoaded", function () {
			if (majax.isReady) return;
			for (var i = 0; i < document.styleSheets.length; i++)
				if (document.styleSheets[i].disabled) {
					setTimeout( arguments.callee, 0 );
					return;
				}
			// and execute any waiting functions
			majax.ready();
		}, false);

	if ( majax.browser.safari ) {
		//var numStyles;
		(function(){
			if (majax.isReady) return;
			if ( document.readyState != "loaded" && document.readyState != "complete" ) {
				setTimeout( arguments.callee, 0 );
				return;
			}
                        /*
			if ( numStyles === undefined )
				numStyles = jQuery("style, link[rel=stylesheet]").length;
			if ( document.styleSheets.length != numStyles ) {
				setTimeout( arguments.callee, 0 );
				return;
			}
                        */
			// and execute any waiting functions
			majax.ready();
		})();
	}

	// A fallback to window.onload, that will always work
    addEvent(window, "load", function () { majax.ready(); });
}

// end of code taken from jQuery

majax.readyListeners.push(majaxLoaded);

bindReady();

function loadJSONFunction (url)
{
    var s = document.createElement("script");
    s.setAttribute("type", "text/javascript");
    s.setAttribute("src", url);
    document.documentElement.firstChild.appendChild(s);
}

function asJSON(data) 
{
    var s;
    if (data == undefined)
        return 'undefined';

    if (data == null)
        return 'null';

    if (typeof data == "string")
        return '"' + data + '"';

    if (typeof data == "object" && 'length' in data) {
        var s = "[";
        for (var i = 0; i < data.length; i++)
            s += asJSON(data[i]) + ", ";
        return s + "]";
    } else 
    if (typeof data == "object") {
        var s = "{";
        for (var p in data) {
            s += p + ":" + asJSON(data[p]) + ",";
        }
        return s + "}";
    } else
        return data;
}

})(majax2ServiceUrl, majax2OpacBase);

