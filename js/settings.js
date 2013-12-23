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

/******************************************************************************/

(function() {

/******************************************************************************/

function gethttpsb() {
    return chrome.extension.getBackgroundPage().HTTPSB;
}

/******************************************************************************/

function changeUserSettings(name, value) {
    chrome.runtime.sendMessage({
        what: 'userSettings',
        name: name,
        value: value
    });
}

/******************************************************************************/

function onChangeValueHandler(elem, setting, min, max) {
    var oldVal = gethttpsb().userSettings[setting];
    var newVal = Math.round(parseFloat(elem.val()));
    if ( typeof newVal !== 'number' ) {
        newVal = oldVal;
    } else {
        newVal = Math.max(newVal, min);
        newVal = Math.min(newVal, max);
    }
    elem.val(newVal);
    if ( newVal !== oldVal ) {
        changeUserSettings(setting, newVal);
    }
}

/******************************************************************************/

function initAll() {
    var httpsb = gethttpsb();
    var userSettings = httpsb.userSettings;

    $('input[name="displayTextSize"]').attr('checked', function(){
        return $(this).attr('value') === userSettings.displayTextSize;
        });
    $('#strict-blocking').attr('checked', userSettings.strictBlocking === true);
    $('#auto-whitelist-page-domain').attr('checked', userSettings.autoWhitelistPageDomain === true);
    $('#delete-unused-session-cookies').attr('checked', userSettings.deleteUnusedSessionCookies === true);
    $('#delete-unused-session-cookies-after').val(userSettings.deleteUnusedSessionCookiesAfter);
    $('#delete-blacklisted-cookies').attr('checked', userSettings.deleteCookies === true);
    $('#delete-blacklisted-localstorage').attr('checked', userSettings.deleteLocalStorage);
    $('#cookie-removed-counter').html(httpsb.cookieRemovedCounter);
    $('#localstorage-removed-counter').html(httpsb.localStorageRemovedCounter);
    $('#process-behind-the-scene').attr('checked', userSettings.processBehindTheSceneRequests);
    $('#max-logged-requests').val(userSettings.maxLoggedRequests);

    // Handle user interaction

    $('input[name="displayTextSize"]').on('change', function(){
        changeUserSettings('displayTextSize', $(this).attr('value'));
    });
    $('#strict-blocking').on('change', function(){
        changeUserSettings('strictBlocking', $(this).is(':checked'));
    });
    $('#auto-whitelist-page-domain').on('change', function(){
        changeUserSettings('autoWhitelistPageDomain', $(this).is(':checked'));
    });
    $('#delete-unused-session-cookies').on('change', function(){
        changeUserSettings('deleteUnusedSessionCookies', $(this).is(':checked'));
    });
    $('#delete-unused-session-cookies-after').on('change', function(){
        onChangeValueHandler($(this), 'deleteUnusedSessionCookiesAfter', 0, 1440);
    });
    $('#delete-blacklisted-cookies').on('change', function(){
        changeUserSettings('deleteCookies', $(this).is(':checked'));
    });
    $('#delete-blacklisted-localstorage').on('change', function(){
        changeUserSettings('deleteLocalStorage', $(this).is(':checked'));
    });
    $('#process-behind-the-scene').on('change', function(){
        changeUserSettings('processBehindTheSceneRequests', $(this).is(':checked'));
    });
    $('#max-logged-requests').on('change', function(){
        onChangeValueHandler($(this), 'maxLoggedRequests', 0, 999);
    });

    $('.whatisthis').on('click', function() {
        $(this).parents('li')
        .first()
        .find('.expandable')
        .toggleClass('expanded');
    });

    $('#bye').on('click', function() {
        onChangeValueHandler($('#delete-unused-session-cookies-after'), 'deleteUnusedSessionCookiesAfter', 0, 1440);
        onChangeValueHandler($('#max-logged-requests'), 'maxLoggedRequests', 0, 999);
        window.open('','_self').close();
    });
}

/******************************************************************************/

$(function() {
    initAll();
});

/******************************************************************************/

})();
