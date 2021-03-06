/*******************************************************************************

    httpswitchboard - a Chromium browser extension to black/white list requests.
    Copyright (C) 2013  Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/httpswitchboard
*/

/* jshint multistr: true */
/* global chrome */

// Injected into content pages

/******************************************************************************/

// OK, I keep changing my mind whether a closure should be used or not. This
// will be the rule: if there are any variables directly accessed on a regular
// basis, use a closure so that they are cached. Otherwise I don't think the
// overhead of a closure is worth it. That's my understanding.

(function() {

/******************************************************************************/
/******************************************************************************/

// If you play with this code, mind:
//   https://github.com/gorhill/httpswitchboard/issues/261
//   https://github.com/gorhill/httpswitchboard/issues/252

var navigatorSpoofer = " \
;(function() { \
    try { \
        var spoofedUserAgent = {{ua-json}}; \
        if ( spoofedUserAgent === navigator.userAgent ) { \
            return; \
        } \
        var realNavigator = navigator; \
        var SpoofedNavigator = function(ua) { \
            this.navigator = navigator; \
        }; \
        var spoofedNavigator = new SpoofedNavigator(spoofedUserAgent); \
        var makeFunction = function(n, k) { \
            n[k] = function() { \
                return this.navigator[k].apply(this.navigator, arguments); }; \
        }; \
        for ( var k in realNavigator ) { \
            if ( typeof realNavigator[k] === 'function' ) { \
                makeFunction(spoofedNavigator, k); \
            } else { \
                spoofedNavigator[k] = realNavigator[k]; \
            } \
        } \
        spoofedNavigator.userAgent = spoofedUserAgent; \
        var pos = spoofedUserAgent.indexOf('/'); \
        spoofedNavigator.appName = pos < 0 ? '' : spoofedUserAgent.slice(0, pos); \
        spoofedNavigator.appVersion = pos < 0 ? spoofedUserAgent : spoofedUserAgent.slice(pos + 1); \
        navigator = window.navigator = spoofedNavigator; \
    } catch (e) { \
    } \
})();";

/******************************************************************************/

// Because window.userAgent is read-only, we need to create a fake Navigator
// object to contain our fake user-agent string.
// Because objects created by a content script are local to the content script
// and not visible to the web page itself (and vice versa), we need the context
// of the web page to create the fake Navigator object directly, and the only
// way to do this is to inject appropriate javascript code into the web page.

var injectNavigatorSpoofer = function(spoofedUserAgent) {
    if ( typeof spoofedUserAgent !== 'string' ) {
        return;
    }
    if ( spoofedUserAgent === navigator.userAgent ) {
        return;
    }
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.id = 'httpsb-ua-spoofer';
    var js = document.createTextNode(navigatorSpoofer.replace('{{ua-json}}', JSON.stringify(spoofedUserAgent)));
    script.appendChild(js);
    document.documentElement.appendChild(script, document.documentElement.firstChild);
};

chrome.runtime.sendMessage({ what: 'getUserAgentReplaceStr' }, injectNavigatorSpoofer);

/******************************************************************************/
/******************************************************************************/

// ABP cosmetic filters

var CosmeticFiltering = function() {
    this.queriedSelectors = {};
    this.injectedSelectors = {};
    this.classSelectors = null;
    this.idSelectors = null;
    this.retrieveDomainSelectors();
};

CosmeticFiltering.prototype.onDOMContentLoaded = function() {
    this.classesFromNodeList(document.querySelectorAll('*[class]'));
    this.idsFromNodeList(document.querySelectorAll('*[id]'));
    this.retrieveGenericSelectors();
};

CosmeticFiltering.prototype.retrieveDomainSelectors = function() {
    //console.log('HTTPSB> ABP cosmetic filters: retrieving CSS rules using domain');
    chrome.runtime.sendMessage({
        what: 'retrieveABPHideSelectors',
        locationURL: window.location.href,
        pageURL: window.location.href
    }, this.retrieveHandler.bind(this, false));
};

CosmeticFiltering.prototype.retrieveGenericSelectors = function() {
    var selectors = this.classSelectors !== null ? Object.keys(this.classSelectors) : [];
    if ( this.idSelectors !== null ) {
        selectors = selectors.concat(this.idSelectors);
    }
    if ( selectors.length > 0 ) {
        //console.log('HTTPSB> ABP cosmetic filters: retrieving CSS rules using %d selectors', selectors.length);
        chrome.runtime.sendMessage({
            what: 'retrieveABPHideSelectors',
            selectors: selectors,
            pageURL: window.location.href
        }, this.retrieveHandler.bind(this, true));
    }
    this.idSelectors = null;
    this.classSelectors = null;
};

CosmeticFiltering.prototype.retrieveHandler = function(generic, selectors) {
    if ( !selectors ) {
        return;
    }
    var styleText = [];
    if ( generic ) {
        this.filterUnfiltered(selectors.hideUnfiltered, selectors.hide);
        this.reduce(selectors.hide, this.injectedSelectors);
    }
    if ( selectors.hide.length ) {
        var hideStyleText = '{{hideSelectors}} {display:none !important;}'
            .replace('{{hideSelectors}}', selectors.hide.join(','));
        styleText.push(hideStyleText);
        //console.log('HTTPSB> ABP cosmetic filters: injecting %d CSS rules:', selectors.hide.length, hideStyleText);
    }
    if ( generic ) {
        this.filterUnfiltered(selectors.donthideUnfiltered, selectors.donthide);
        this.reduce(selectors.donthide, this.injectedSelectors);
    }
    if ( selectors.donthide.length ) {
        var dontHideStyleText = '{{donthideSelectors}} {display:initial !important;}'
            .replace('{{donthideSelectors}}', selectors.donthide.join(','));
        styleText.push(dontHideStyleText);
        //console.log('HTTPSB> ABP cosmetic filters: injecting %d CSS rules:', selectors.donthide.length, dontHideStyleText);
    }
    if ( styleText.length > 0 ) {
        var style = document.createElement('style');
        style.appendChild(document.createTextNode(styleText.join('')));
        document.documentElement.appendChild(style);
    }
};

CosmeticFiltering.prototype.filterUnfiltered = function(inSelectors, outSelectors) {
    var i = inSelectors.length;
    var selector;
    while ( i-- ) {
        selector = inSelectors[i];
        if ( this.injectedSelectors[selector] ) {
            continue;
        }
        if ( document.querySelector(selector) !== null ) {
            outSelectors.push(selector);
        }
    }
};

CosmeticFiltering.prototype.reduce = function(selectors, dict) {
    var first = dict.httpsb === undefined;
    var i = selectors.length, selector, end;
    while ( i-- ) {
        selector = selectors[i];
        if ( first || !dict[selector] ) {
            if ( end !== undefined ) {
                selectors.splice(i+1, end-i);
                end = undefined;
            }
            dict[selector] = true;
        } else if ( end === undefined ) {
            end = i;
        }
    }
    if ( end !== undefined ) {
        selectors.splice(0, end+1);
    }
    dict.httpsb = true;
};

CosmeticFiltering.prototype.classesFromNodeList = function(nodes) {
    if ( !nodes ) {
        return;
    }
    if ( this.classSelectors === null ) {
        this.classSelectors = {};
    }
    var classNames, className, j;
    var i = nodes.length;
    while ( i-- ) {
        className = nodes[i].className;
        if ( typeof className !== 'string' ) {
            continue;
        }
        className = className.trim();
        if ( className === '' ) {
            continue;
        }
        if ( className.indexOf(' ') < 0 ) {
            className = '.' + className;
            if ( this.queriedSelectors[className] ) {
                continue;
            }
            this.classSelectors[className] = true;
            this.queriedSelectors[className] = true;
            continue;
        }
        classNames = className.trim().split(/\s+/);
        j = classNames.length;
        while ( j-- ) {
            className = classNames[j];
            if ( className === '' ) {
                continue;
            }
            className = '.' + className;
            if ( this.queriedSelectors[className] ) {
                continue;
            }
            this.classSelectors[className] = true;
            this.queriedSelectors[className] = true;
        }
    }
};

CosmeticFiltering.prototype.idsFromNodeList = function(nodes) {
    if ( !nodes ) {
        return;
    }
    if ( this.idSelectors === null ) {
        this.idSelectors = [];
    }
    var id;
    var i = nodes.length;
    while ( i-- ) {
        id = nodes[i].id;
        if ( typeof id !== 'string' ) {
            continue;
        }
        id = id.trim();
        if ( id === '' ) {
            continue;
        }
        id = '#' + id;
        if ( this.queriedSelectors[id] ) {
            continue;
        }
        this.idSelectors.push(id);
        this.queriedSelectors[id] = true;
    }
};

CosmeticFiltering.prototype.allFromNodeList = function(nodes) {
    this.classesFromNodeList(nodes);
    this.idsFromNodeList(nodes);
};

var cosmeticFiltering = new CosmeticFiltering();

/******************************************************************************/
/******************************************************************************/

/*------------[ Unrendered Noscript (because CSP) Workaround ]----------------*/

var fixNoscriptTags = function() {
    var a = document.querySelectorAll('noscript');
    var i = a.length;
    var realNoscript,
        fakeNoscript;
    while ( i-- ) {
        realNoscript = a[i];
        fakeNoscript = document.createElement('div');
        fakeNoscript.innerHTML = '<!-- HTTP Switchboard NOSCRIPT tag replacement: see <https://github.com/gorhill/httpswitchboard/issues/177> -->\n' + realNoscript.textContent;
        realNoscript.parentNode.replaceChild(fakeNoscript, realNoscript);
    }
};

var checkScriptBlacklistedHandler = function(response) {
    if ( response.scriptBlacklisted ) {
        fixNoscriptTags();
    }
};

var checkScriptBlacklisted = function() {
    chrome.runtime.sendMessage({
        what: 'checkScriptBlacklisted',
        url: window.location.href
    }, checkScriptBlacklistedHandler);
};

/******************************************************************************/
/******************************************************************************/

var localStorageHandler = function(mustRemove) {
    if ( mustRemove ) {
        window.localStorage.clear();
        // console.debug('HTTP Switchboard > found and removed non-empty localStorage');
    }
};

/******************************************************************************/
/******************************************************************************/

var nodesAddedHandler = function(nodeList, summary) {
    var i = 0;
    var node, src, text;
    while ( node = nodeList.item(i++) ) {
        if ( !node.tagName ) {
            continue;
        }

        switch ( node.tagName.toUpperCase() ) {

        case 'SCRIPT':
            // https://github.com/gorhill/httpswitchboard/issues/252
            // Do not count HTTPSB's own script tags, they are not required
            // to "unbreak" a web page
            if ( node.id && node.id.indexOf('httpsb-') === 0 ) {
                break;
            }
            text = node.textContent.trim();
            if ( text !== '' ) {
                summary.scriptSources['{inline_script}'] = true;
                summary.mustReport = true;
            }
            src = (node.src || '').trim();
            if ( src !== '' ) {
                summary.scriptSources[src] = true;
                summary.mustReport = true;
            }
            break;

        case 'A':
            if ( node.href.indexOf('javascript:') === 0 ) {
                summary.scriptSources['{inline_script}'] = true;
                summary.mustReport = true;
            }
            break;

        case 'OBJECT':
            src = (node.data || '').trim();
            if ( src !== '' ) {
                summary.pluginSources[src] = true;
                summary.mustReport = true;
            }
            break;

        case 'EMBED':
            src = (node.src || '').trim();
            if ( src !== '' ) {
                summary.pluginSources[src] = true;
                summary.mustReport = true;
            }
            break;
        }
    }
};

/******************************************************************************/

var mutationObservedHandler = function(mutations) {
    var summary = {
        what: 'contentScriptSummary',
        locationURL: window.location.href,
        scriptSources: {}, // to avoid duplicates
        pluginSources: {}, // to avoid duplicates
        mustReport: false
    };
    var iMutation = mutations.length;
    var mutation;
    while ( iMutation-- ) {
        mutation = mutations[iMutation];
        if ( !mutation.addedNodes || !mutation.addedNodes.length ) {
            // TODO: attr changes also must be dealth with, but then, how
            // likely is it...
            continue;
        }
        nodesAddedHandler(mutation.addedNodes, summary);
        cosmeticFiltering.allFromNodeList(mutation.addedNodes);
    }

    cosmeticFiltering.retrieveGenericSelectors();

    if ( summary.mustReport ) {
        chrome.runtime.sendMessage(summary);
    }
};

/******************************************************************************/

var firstObservationHandler = function() {
    var summary = {
        what: 'contentScriptSummary',
        locationURL: window.location.href,
        scriptSources: {}, // to avoid duplicates
        pluginSources: {}, // to avoid duplicates
        localStorage: false,
        indexedDB: false,
        mustReport: true
    };
    // https://github.com/gorhill/httpswitchboard/issues/25
    // &
    // Looks for inline javascript also in at least one a[href] element.
    // https://github.com/gorhill/httpswitchboard/issues/131
    nodesAddedHandler(document.querySelectorAll('script, a[href^="javascript:"], object, embed'), summary);

    // Check with extension whether local storage must be emptied
    // rhill 2014-03-28: we need an exception handler in case 3rd-party access
    // to site data is disabled.
    // https://github.com/gorhill/httpswitchboard/issues/215
    try {
        if ( window.localStorage && window.localStorage.length ) {
            summary.localStorage = true;
            chrome.runtime.sendMessage({
                what: 'contentScriptHasLocalStorage',
                url: summary.locationURL
            }, localStorageHandler);
        }

        // TODO: indexedDB
        if ( window.indexedDB && !!window.indexedDB.webkitGetDatabaseNames ) {
            // var db = window.indexedDB.webkitGetDatabaseNames().onsuccess = function(sender) {
            //    console.debug('webkitGetDatabaseNames(): result=%o', sender.target.result);
            // };
        }

        // TODO: Web SQL
        if ( window.openDatabase ) {
            // Sad:
            // "There is no way to enumerate or delete the databases available for an origin from this API."
            // Ref.: http://www.w3.org/TR/webdatabase/#databases
        }
    }
    catch (e) {
    }

    // console.debug('HTTPSB> firstObservationHandler(): found %d script tags', Object.keys(summary.scriptSources).length);

    chrome.runtime.sendMessage(summary);
};

/******************************************************************************/
/******************************************************************************/

var onLoaded = function() {
    cosmeticFiltering.onDOMContentLoaded();

    // Checking to see if script is blacklisted
    // Not sure if this is right place to check. I don't know if subframes with
    // <noscript> tags will be fixed.
    checkScriptBlacklisted();

    firstObservationHandler();

    // Observe changes in the DOM
    // https://github.com/gorhill/httpswitchboard/issues/176
    var observer = new MutationObserver(mutationObservedHandler);
    observer.observe(document.body, {
        attributes: false,
        childList: true,
        characterData: false,
        subtree: true
    });
};

/******************************************************************************/
/******************************************************************************/

// rhill 2013-11-09: Weird... This code is executed from HTTP Switchboard
// context first time extension is launched. Avoid this.
// TODO: Investigate if this was a fluke or if it can really happen.
// I suspect this could only happen when I was using chrome.tabs.executeScript(),
// because now a delarative content script is used, along with "http{s}" URL
// pattern matching.

// console.debug('HTTPSB> window.location.href = "%s"', window.location.href);

if ( /^https?:\/\/./.test(window.location.href) ) {
    // rhill 2014-01-26: If document is already loaded, handle all immediately,
    // otherwise defer to later when document is loaded.
    // https://github.com/gorhill/httpswitchboard/issues/168
    if ( document.readyState === 'loading' ) {
        window.addEventListener('DOMContentLoaded', onLoaded);
    } else {
        onLoaded();
    }
}

/******************************************************************************/

})();

/******************************************************************************/
