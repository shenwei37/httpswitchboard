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

// TODO: need to rebase all recipe stuff to use HTTPSB.reciper

/******************************************************************************/

(function() {

var recipeWidth = 40;

/******************************************************************************/

var friendlyTypeNames = {
    '*': '\u2217',
    'cookie': 'cookie',
    'stylesheet': 'css',
    'image': 'img',
    'object': 'plugin',
    'script': 'script',
    'xmlhttprequest': 'XHR',
    'sub_frame': 'frame',
    'other': 'other'
};

/******************************************************************************/

function getBackground() {
    return chrome.extension.getBackgroundPage();
}

function getHTTPSB() {
    return getBackground().HTTPSB;
}

/******************************************************************************/

// A recipe rule is always:
// "        {type} {hostname}\n"

function renderRuleToRecipeString(rule) {
    // Do not report '* main_frame' it is an internal
    // read-only rule
    if ( rule === 'main_frame|*' ) {
        return '';
    }
    return '        ' + rule.replace('|',' ') + '\n';
}

function renderRecipeStringToRule(recipe) {
    var parts = recipe.match(/^        ([a-z*_]+) +([-.:a-z0-9*]+)$/);
    if ( !parts ) {
        return false;
    }
    // Validate hostname
    var hostname = parts[2];
    if ( hostname !== '*' && !getHTTPSB().URI.isValidHostname(hostname) ) {
        return false;
    }
    // Validate type
    var type = parts[1];
    if ( !friendlyTypeNames[parts[1]] ) {
        return false;
    }
    return type + '|' + hostname;
}

/******************************************************************************/

// A recipe list name is always:
// "    {list name}\n"

function renderPermissionToRecipeString(permissionName, permission) {
    var s = '';
    var rules = Object.keys(permission.list);
    var i = rules.length;
    if ( i ) {
        s = '    ' + permissionName + '\n';
        while ( i-- ) {
            s += renderRuleToRecipeString(rules[i]);
        }
    }
    return s;
}

function renderRecipeStringToListKey(recipe) {
    var parts = recipe.match(/^    (whitelist|blacklist|graylist)$/);
    if ( !parts ) {
        return false;
    }
    return parts[1].replace('list', '');
}

/******************************************************************************/

// A recipe scope key is always:
// "{root url}" or "*"

function renderScopeToRecipeString(scopeKey, scope) {
    var s = scopeKey + '\n';
    s += renderPermissionToRecipeString('whitelist', scope.white);
    s += renderPermissionToRecipeString('blacklist', scope.black);
    s += renderPermissionToRecipeString('graylist', scope.gray);
    return s;
}

function renderRecipeStringToScopeKey(recipe) {
    var parts = recipe.match(/^(\*|(https?:\/\/)?(\*\.)?[-.:a-z0-9]+)$/);
    if ( !parts ) {
        return false;
    }
    var httpsb = getHTTPSB();
    var scopeKey = parts[1];
    if ( !httpsb.isValidScopeKey(scopeKey) ) {
        return false;
    }
    return scopeKey;
}

/******************************************************************************/

function renderAllScopesToRecipeString(scopes) {
    var s = '';
    var scopeKeys = Object.keys(scopes);
    var i = scopeKeys.length;
    var scopeKey;
    while ( i-- ) {
        scopeKey = scopeKeys[i];
        s += renderScopeToRecipeString(scopeKey, scopes[scopeKey]);
    }
    return s;
}

/******************************************************************************/

function uglifyRecipe(recipe) {
    recipe = encodeURIComponent(recipe.replace(/    /g, '\t'));
    var s = '';
    while ( recipe.length ) {
        s += recipe.slice(0, recipeWidth) + '\n';
        recipe = recipe.slice(recipeWidth);
    }
    return s;
}

function updateUglyRecipeWidget() {
    try {
        var val = $('#recipeUgly').val();
        decodeURIComponent(val.replace(/\n/g, '').trim());
        $('#recipeUgly').removeClass('bad');
        $('#backup').prop("disabled", val === '');
    }
    catch (e) {
        $('#recipeUgly').addClass('bad');
        $('#backup').prop("disabled", true);
    }
}

function beautifyRecipe(recipe) {
    try {
        recipe = decodeURIComponent(recipe.replace(/\n/g, '').trim()).replace(/\t/g, '    ');
        // rhill 2014-27-01: Remove scheme from scope keys.
        // https://github.com/gorhill/httpswitchboard/issues/165
        recipe = recipe.replace(/(^|\n)https?:\/\//g, '$1');
        $('#recipeUgly').removeClass('bad');
    }
    catch (e) {
        $('#recipeUgly').addClass('bad');
        return '';
    }
    return recipe;
}

/******************************************************************************/

function renderRuleKeyToHTML(rule) {
    var pos = rule.indexOf('|');
    return document.createTextNode(
        friendlyTypeNames[rule.slice(0, pos)] +
        ' ' +
        rule.slice(pos + 1).replace('*', '\u2217')
    );
}

/******************************************************************************/

// I originally chose to have type first than hostname second... which means
// that using stock sort() doesn't give nice results.

function compareRules(a, b) {
    var aparts = a.split('|');
    var bparts = b.split('|');
    if ( aparts[0] < bparts[0] ) {
        return 1;
    }
    if ( aparts[0] > bparts[0] ) {
        return -1;
    }
    if ( aparts[1] < bparts[1] ) {
        return 1;
    }
    if ( aparts[1] > bparts[1] ) {
        return -1;
    }
    return 0;
}

/******************************************************************************/

function renderScopeKeyToHTML(scopeKey) {
    var div = $('<div>');
    var scopeNameElement = $('<span>', {
        'text': scopeKey.replace('*', '\u2217'),
        'class': 'scopeName'
        });
    div.append(scopeNameElement);
    div.append($('<span>', {
        'class': 'fa state'
        })
    );
    return div;
}

/******************************************************************************/

function strToId(s) {
    return s.replace(/[ 0123456789*./:|-]/g, function(c) {
        return 'GHIJKLMNOPQRSTUVWXYZ'.charAt(' 0123456789*./:|-'.indexOf(c));
    });
}

function IdToStr(id) {
    return id.replace(/[G-Z]/g, function(c) {
        return ' 0123456789*./:|-'.charAt('GHIJKLMNOPQRSTUVWXYZ'.indexOf(c));
    });
}

/******************************************************************************/

function liScopeFromScopeKey(scopeKey) {
    var liScope = $('.' + strToId(scopeKey));
    return liScope.length ? liScope : null;
}

/******************************************************************************/

function liListFromScopeKey(scopeKey, listKey) {
    var liList = $('.' + strToId(scopeKey) + ' .' + strToId(listKey));
    return liList.length ? liList : null;
}

/******************************************************************************/

function liRuleFromRuleKey(scopeKey, listKey, ruleKey) {
    var liRule = $('.' + strToId(scopeKey) + ' .' + strToId(listKey) + ' .' + strToId(ruleKey));
    return liRule.length ? liRule : null;
}

/******************************************************************************/

function renderScopeToHTML(scopeKey) {
    var liScope = $('<li>', {
        'class': 'scope ' + strToId(scopeKey)
    });
    liScope.prop('scopeKey', scopeKey);
    liScope.append(renderScopeKeyToHTML(scopeKey));
    return liScope;
}

/******************************************************************************/

function renderListToHTML(listKey) {
    var liList = $('<li>', {
            'class': 'list ' + strToId(listKey),
            'text': listKey + 'list'
        });
    liList.prop('listKey', listKey);
    return liList;
}

/******************************************************************************/

function renderRuleToHTML(ruleKey) {
    var liRule = $('<li>', {
        'class': 'rule ' + strToId(ruleKey),
        'html': renderRuleKeyToHTML(ruleKey)
    });
    liRule.prop('rule', ruleKey);
    $('<span>', { 'class': 'fa state' }).appendTo(liRule);
    return liRule;
}

/******************************************************************************/

function renderTemporaryScopeTreeToHTML(scopeKey) {
    var httpsb = getHTTPSB();
    var tscope = httpsb.temporaryScopes.scopes[scopeKey];
    var liScope = renderScopeToHTML(scopeKey);
    var ulLists = $('<ul>');
    liScope.append(ulLists);
    var lists = ['gray', 'black', 'white'];
    var iList = lists.length;
    var listKey, tlist, liList;
    var rules, iRule, ruleKey, ulRules, liRule;
    while ( iList-- ) {
        listKey = lists[iList];
        tlist = tscope[listKey].list;
        rules = Object.keys(tlist).sort(compareRules);
        iRule = rules.length;
        liList = renderListToHTML(listKey);
        ulRules = $('<ul>', {});
        while ( iRule-- ) {
            ruleKey = rules[iRule];
            // Skip '* main_frame', there is no matrix cell for this, which
            // means user wouldn't be able to add it back if user were to
            // remove this rule.
            if ( ruleKey === 'main_frame|*' ) {
                continue;
            }
            liRule = renderRuleToHTML(ruleKey);
            liRule.appendTo(ulRules);
        }
        ulRules.appendTo(liList);
        liList.appendTo(ulLists);
    }
    var recipe = uglifyRecipe(renderScopeToRecipeString(scopeKey, tscope));
    $('<div>', {
        'class': 'recipe',
        'title': 'Recipe',
        'text': recipe
    }).appendTo(liScope);
    return liScope;
}

/******************************************************************************/

function renderPermanentScopeTreeToHTML(scopeKey) {
    var httpsb = getHTTPSB();
    var pscope = httpsb.permanentScopes.scopes[scopeKey];
    var liScope = liScopeFromScopeKey(scopeKey);
    if ( liScope ) {
        liScope.addClass('permanent');
    } else {
        // ???
    }
    var lists = ['gray', 'black', 'white'];
    var iList = lists.length;
    var listKey, plist;
    var rules, iRule, ruleKey, liRule;
    while ( iList-- ) {
        listKey = lists[iList];
        plist = pscope[listKey].list;
        rules = Object.keys(plist).sort(compareRules);
        iRule = rules.length;
        while ( iRule-- ) {
            ruleKey = rules[iRule];
            // Skip '* main_frame', there is no matrix cell for this, which
            // means user wouldn't be able to add it back if user were to
            // remove this rule.
            if ( ruleKey === 'main_frame|*' ) {
                continue;
            }
            liRule = liRuleFromRuleKey(scopeKey, listKey, ruleKey);
            if ( liRule ) {
                liRule.addClass('permanent');
            } else {
                liRule = renderRuleToHTML(ruleKey, false);
                liRule.appendTo(liListFromScopeKey(scopeKey, 'gray').children('ul'));
            }
        }
    }
}

/******************************************************************************/

function renderScopes(domContainerId, filterFn) {
    var httpsb = getHTTPSB();
    var scopes = httpsb.temporaryScopes.scopes;
    var ulScopes = $('<ul>');
    var scope, liScope, scopeKey;
    for ( scopeKey in scopes ) {
        if ( !scopes.hasOwnProperty(scopeKey) ) {
            continue;
        }
        if ( !filterFn(httpsb, scopeKey) ) {
            continue;
        }
        scope = scopes[scopeKey];
        if ( scope.off ) {
            continue;
        }
        liScope = renderTemporaryScopeTreeToHTML(scopeKey);
        liScope.appendTo(ulScopes);
    }
    $(domContainerId).empty().append(ulScopes);
    scopes = httpsb.permanentScopes.scopes;
    for ( scopeKey in scopes ) {
        if ( !scopes.hasOwnProperty(scopeKey) ) {
            continue;
        }
        if ( !filterFn(httpsb, scopeKey) ) {
            continue;
        }
        scope = scopes[scopeKey];
        renderPermanentScopeTreeToHTML(scopeKey);
    }
}

/******************************************************************************/

function renderGlobalScope() {
    var filterFn = function(httpsb, scopeKey) {
        return httpsb.isGlobalScopeKey(scopeKey);
    };
    renderScopes('#global', filterFn);
}

/******************************************************************************/

function renderDomainScopes() {
    var filterFn = function(httpsb, scopeKey) {
        return httpsb.isDomainScopeKey(scopeKey);
    };
    renderScopes('#perdomain', filterFn);
}

/******************************************************************************/

function renderSiteScopes() {
    var filterFn = function(httpsb, scopeKey) {
        return httpsb.isSiteScopeKey(scopeKey) && scopeKey !== httpsb.behindTheSceneScopeKey;
    };
    renderScopes('#persite', filterFn);
}

/******************************************************************************/

function renderBtsScope() {
    var filterFn = function(httpsb, scopeKey) {
        return scopeKey === httpsb.behindTheSceneScopeKey;
    };
    renderScopes('#behind-the-scene', filterFn);
}

/******************************************************************************/

function renderRecipe() {
    $('#recipeUgly').val(uglifyRecipe(renderAllScopesToRecipeString(getHTTPSB().permanentScopes.scopes)));
}

/******************************************************************************/

function renderAll() {
    renderGlobalScope();
    renderDomainScopes();
    renderSiteScopes();
    renderBtsScope();
    updateButtons();
}

/******************************************************************************/

function selectRecipeText(elem) {
    var selection = window.getSelection();        
    var range = document.createRange();
    range.selectNodeContents(elem);
    selection.removeAllRanges();
    selection.addRange(range);
}

/******************************************************************************/

function renderJournalFromImportField() {
    var rules = $('#recipeBeautiful').val();
    var journal = [];
    var lines = rules.split('\n');
    var scopeKey = false;
    var listKey = false;
    var line, r;
    while ( lines.length ) {
        line = lines.splice(0,1)[0];
        if ( line.trim() === '' ) {
            continue;
        }
        if ( r = renderRecipeStringToScopeKey(line) ) {
            scopeKey = r;
        } else if ( r = renderRecipeStringToListKey(line) ) {
            if ( !scopeKey ) {
                return false;
            }
            listKey = r;
        } else if ( r = renderRecipeStringToRule(line) ) {
            if ( !scopeKey || !listKey ) {
                return false;
            }
            journal.push({
                scopeKey: scopeKey,
                listKey: listKey,
                rule: r
            });
        } else {
            return false;
        }
    }

    return journal;
}

/******************************************************************************/

function renderImportFieldFromRecipe() {
    $('#recipeBeautiful').val(beautifyRecipe($('#recipeUgly').val()));
    $('#recipeBeautiful').toggleClass('bad', !renderJournalFromImportField());
}

/******************************************************************************/

function applyJournalTemporarily() {
    var journal = renderJournalFromImportField();
    if ( !journal ) {
        return;
    }
    var httpsb = getHTTPSB();
    var i = journal.length;
    var entry, scopeKey, pivot, type, hostname;
    while ( i-- ) {
        entry = journal[i];
        scopeKey = entry.scopeKey;
        pivot = entry.rule.indexOf('|');
        if ( pivot < 0 ) {
            continue;
        }
        type = entry.rule.slice(0, pivot);
        hostname = entry.rule.slice(pivot+1);
        httpsb.createTemporaryScopeFromScopeKey(scopeKey);
        httpsb.addTemporaryRule(scopeKey, entry.listKey, type, hostname);
    }

    // Force a refresh of all scopes/rules
    renderAll();
}

/******************************************************************************/

function toggleDeleteScope(event) {
    var liScope = $(this).parents('.scope');
    liScope.toggleClass('todelete');
    liScope.find('.rule').removeClass('todelete');
    updateButtons();
    event.stopPropagation();
}

/******************************************************************************/

function toggleDeleteRule(event) {
    $(this).toggleClass('todelete');
    updateButtons();
    event.stopPropagation();
}

/******************************************************************************/

function commitAll() {
    if ( !confirmDeleteAll() ) {
        return false;
    }
    deleteAll();

    // Persist whatever is left
    var httpsb = getHTTPSB();
    httpsb.commitPermissions(true);
    renderAll();

    return true;
}

/******************************************************************************/

function revertAll() {
    var httpsb = getHTTPSB();
    httpsb.revertAllRules();
    renderAll();
}

/******************************************************************************/

function markAllForDeletion() {
    $('.scope').addClass('todelete');
    updateButtons();
}

/******************************************************************************/

function deleteAll() {
    var httpsb = getHTTPSB();
    var i;
    var liScope, scopeKey;
    var liList;
    var liRule, rule, pos, type, hostname;

    // Delete scopes marked for deletion
    var liScopes = $('.scope.todelete');
    i = liScopes.length;
    while ( i-- ) {
        liScope = $(liScopes[i]);
        scopeKey = liScope.prop('scopeKey');
        // rhill 2014-01-27: Do not remove global or behind-the-scene scopes.
        // https://github.com/gorhill/httpswitchboard/issues/160
        if ( scopeKey === '*' || scopeKey === httpsb.behindTheSceneScopeKey ) {
            continue;
        }
        httpsb.removeTemporaryScopeFromScopeKey(scopeKey);
        liScope.remove();
    }

    liRules = $('.scope.todelete .rule,.rule.todelete');
    i = liRules.length;
    while ( i-- ) {
        liRule = $(liRules[i]);
        liList = liRule.parents('.list');
        liScope = liList.parents('.scope');
        scopeKey = liScope.prop('scopeKey');
        listKey = liList.prop('listKey');
        rule = liRule.prop('rule');
        pos = rule.indexOf('|');
        type = rule.slice(0, pos);
        hostname = rule.slice(pos + 1);
        httpsb.removeTemporaryRule(
            scopeKey,
            listKey,
            type,
            hostname
        );
    }
}

/******************************************************************************/

function confirmDeleteAll() {
    var deleteCount = $('.scope.todelete .rule,.rule.todelete').length;
    if ( deleteCount ) {
        var prompt = $('#confirmRemoveAll').text().replace('{{deleteCount}}', deleteCount);
        if ( !confirm(prompt) ) {
            $('.scope').removeClass('todelete');
            return false;
        }
    }
    return true;
}

/******************************************************************************/

function resetAll() {
    $('.scope').addClass('todelete');
    if ( !confirmDeleteAll() ) {
        return false;
    }
    deleteAll();
    var httpsb = getHTTPSB();
    httpsb.whitelistTemporarily('*', 'main_frame', '*');
    httpsb.whitelistTemporarily('*', 'stylesheet', '*');
    httpsb.whitelistTemporarily('*', 'image', '*');
    httpsb.blacklistTemporarily('*', 'sub_frame', '*');
    httpsb.whitelistTemporarily(httpsb.behindTheSceneScopeKey, '*', '*');
    httpsb.commitPermissions(true);
    renderAll();
    updateButtons();
}

/******************************************************************************/

function saveAllToFile() {
    var uglyRecipes = uglifyRecipe(renderAllScopesToRecipeString(getHTTPSB().permanentScopes.scopes));
    var url = 'data:text/plain,' + uglyRecipes;
    chrome.downloads.download({
        'url': url,
        'filename': 'httpsb-all-rules-backup.txt',
        'saveAs': true
    });
}

/******************************************************************************/

function fileReaderOnLoadHandler() {
    var ugly = uglifyRecipe(this.result);
    $('#recipeUgly').val(ugly);
    updateUglyRecipeWidget();
}

function filePickerOnChangeHandler() {
    $(this).off('change', filePickerOnChangeHandler);
    var file = this.files[0];
    if ( !file ) {
        return;
    }
    if ( file.type.indexOf('text') !== 0 ) {
        return;
    }
    var fr = new FileReader();
    fr.onload = fileReaderOnLoadHandler;
    fr.readAsText(file);
}

function restoreFromFile() {
    var input = $('<input />').attr({
        type: 'file',
        accept: 'text/plain'
    });
    input.on('change', filePickerOnChangeHandler);
    input.trigger('click');
}

/******************************************************************************/

function updateButtons() {
    var notOneTemporary = $('.scope:not(.permanent),.scope.permanent .rule:not(.permanent)').length === 0;
    var notOneDeletion = $('.todelete').length === 0;
    $('#commitAll').prop("disabled", notOneTemporary && notOneDeletion);
    $('#revertAll').prop("disabled", notOneTemporary && notOneDeletion);
    $('#markAllForDeletion').prop("disabled", $('.scope:not(.todelete)').length === 0);
}

/******************************************************************************/

$(function() {
    $('#commitAll').on('click', commitAll);
    $('#revertAll').on('click', revertAll);
    $('#markAllForDeletion').on('click', markAllForDeletion);
    $('#resetAll').on('click', resetAll);

    $('#backup').on('click', saveAllToFile);
    $('#restore').on('click', restoreFromFile);

    $('#recipeDecode').on('click', function(){
        if ( !$('#recipeUgly').hasClass('bad') ) {
            renderImportFieldFromRecipe();
        }
    });

    $('#recipeEncode').on('click', function(){
        if ( !$('#recipeBeautiful').hasClass('bad') ) {
            $('#recipeUgly').val(uglifyRecipe($('#recipeBeautiful').val()));
            updateUglyRecipeWidget();
        }
    });

    $('#recipeUgly').on('input propertychange', function(){
        updateUglyRecipeWidget();
    });

    $('#recipeBeautiful').on('input propertychange', function(){
        $('#recipeBeautiful').toggleClass('bad', !renderJournalFromImportField());
    });

    $('#recipeImport').on('click', function(){
        applyJournalTemporarily();
    });

    $('#recipeExport').on('click', function(){
        $('#recipeBeautiful').val(renderAllScopesToRecipeString(getHTTPSB().permanentScopes.scopes));
        $('#recipeBeautiful').removeClass('bad');
    });

    // Auto-select all encoded recipe
    $('#recipeUgly').on('click', function(){
        this.focus();
        this.select();
    });

    // Auto-select all contents of recipe
    $('body').on('click', 'div.recipe', function(){
        selectRecipeText(this);
    });

    // Toggle deletion
    $('body').on('click', '.rule', toggleDeleteRule);
    $('body').on('click', '.scopeName', toggleDeleteScope);

    $('#bye').on('click', function() {
        window.open('','_self').close();
    });

    renderAll();
});

/******************************************************************************/

})();
