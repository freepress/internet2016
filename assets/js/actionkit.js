window.actionkit = { 'utils': {}, 'forms': {}, 'sharing': {}, 'checks': {} };

// Keep console.log() from being an error
if ( !window.console ) window.console = { log: function() {} };
// Or country_change()
window.country_change = function() {};

(function(ak, utils, forms, sharing, checks) {

var $ = window.jQuery;
// If we have multiple forms, just search within this form;
// otherwise search whole doc.
var $sel = function(selector) { 
    if ( ak.multiForms && ak.form ) 
        return $(ak.form).find(selector);
    return $(selector);
};
// Find by ID or (if we have multiple forms) class
var $id = function(id) { 
    if ( !ak.multiForms ) return document.getElementById(id);
    return $sel('#' + id + ', .' + id)[0]
};
var $log = function(item) { if (window.console) window.console.log(item); };

var $text = function(str) { return (forms.text && forms.text[str]) || '' };

// Accepts an error_name like 'card_num:invalid'
forms.errorMessage = function(error_name) { 
    var pieces = error_name.split(':');
    var field_name = pieces[0];
    var error_type = pieces[1];
    
    var field_name = forms.fixStateAndPostalFieldName(field_name)
    
    if ( ak.form['error_' + error_name] )
        return ak.form['error_' + error_name].value;

    if ( $text('error_' + error_name) ) 
        return $text('error_' + error_name);

    var formatString = $text('error_TEMPLATE:' + error_type);
    return utils.capitalize(
        utils.format(formatString, forms.fieldName(field_name))
    );
};

forms.isUnitedStates = function() {
    var country = ak.form && ak.form.country && utils.val(ak.form.country);
    return country == 'United States' || country == 'US' || !country;
}

// Call postal "ZIP Code" in the US and call zip "postal code" elsewhere
// (in error messages)
forms.fixStateAndPostalFieldName = function(field_name) {
    if (!/^(zip|postal|region|state)$/.test(field_name)) 
        return field_name;
    
    if ( forms.isUnitedStates() ) {
        if ( field_name == 'postal' ) return 'zip';
        if ( field_name == 'region' ) return 'state';
    }
    else {
        if ( field_name == 'zip' ) return 'postal';
        if ( field_name == 'state' ) return 'region';
    }
    
    return field_name;
}

forms.fieldName = function(field_name) {
    if ( ak.form['field_' + field_name] )
        return ak.form['field_' + field_name].value;

    if ( $text('field_' + field_name) ) 
        return $text('field_' + field_name);

    clean_name = field_name.replace(/^(user|action)_/, '');
    clean_name = clean_name.replace(/_/g, ' ').toLowerCase();
    return clean_name;
}

forms.contextRoot = '/context/';

/* Any form initialization we can do before we have context */
forms.beforeContextLoad = function() {
    if ( ak.args.event_id && ak.form.event_id )
        ak.form.event_id.value = ak.args.event_id;
    if ( ak.args.zip 
         && ak.form.template 
         && ak.form.template.value == 'event_search.html'
         && !ak.form.have_events ) {
        var placeField = ak.form.zip || ak.form.place;
        placeField.value = ak.args.zip || ak.args.place;
        if ( ak.form.akid ) 
            ak.form.akid.value = ak.args.akid;
        actionkit.forms.eventSearch(ak.form);
    }
}

/* Ask for user info, congress #s, etc. ("context") via script tag */
forms.loadContext = function() {

    var preload = window.actionkitContext;
    if ( preload ) {
        if ( preload.length )
            return actionkit.forms.onContextLoaded(preload[0]);
        else
            return window.actionkitContext = {
                push: actionkit.forms.onContextLoaded,
                failed: function() { // preload fail, load the regular way
                    window.actionkitContext = undefined;
                    forms.loadContext()
                }
            };
    }

    var contextArgs = {};
    
    forms.beforeContextLoad();

    contextArgs.callback = 'actionkit.forms.onContextLoaded';
    contextArgs.form_name = ak.form_name;
    if ( ak.args.action_id ) contextArgs.action_id = ak.args.action_id;
    if ( ak.args.akid ) contextArgs.akid = ak.args.akid;
    if ( ak.args.rd ) contextArgs.rd = ak.args.rd;
    if ( ak.args.ar ) contextArgs.ar = ak.args.ar;
    if ( ak.args.update ) contextArgs.ar = 1;
    if ( ak.args.akdebug ) contextArgs.akdebug = 1;
    contextArgs.required = forms.required();
    if ( ak.form.want_progress ) contextArgs.want_progress = 1;
    if ( ak.form.template ) 
        contextArgs.template = ak.form.template.value;
    if ( ak.form.whipcount ) contextArgs.whipcount = ak.form.whipcount;
    if ( ak.args.want_prefill_data )
        contextArgs.want_prefill_data = 1;
    contextArgs.r = Math.random() // bust caching of response
    
    // Long URLs mess up MSIE and clutter up GET urls
    var url = '' + window.location;
    if ( url.length < 500 && ak.form.method != 'GET' ) 
        contextArgs.url = url;
    
    var root = forms.contextRoot;
    if ( !/\/$/.test(root) ) root += '/';
    
    var contextUrl = (root + ak.form.page.value + '?' + utils.makeQueryString(contextArgs));
    
    forms.createScriptElement(contextUrl);
};

forms.loadPrefiller = function() {
    var prefillerUrl = forms.contextRoot.replace('/context/', '/samples/prefill.js');
    forms.createScriptElement(prefillerUrl);
}

forms.loadProgress = function() {
    var progressUrl = forms.contextRoot.replace(
        '/context/', 
        '/progress/' + ak.form.page.value + '?form_name=' + ak.form_name + '&callback=actionkit.forms.onProgressLoaded'
    );
    forms.createScriptElement(progressUrl);
}

forms.onProgressLoaded = function(progress) {
    if ( progress.form_name )
        forms.setForm(progress.form_name);
    ak.context.progress = progress;
    // This may be a jQuery bug: I have to manually filter for htmlFor ==
    // 'progress'
    var templates = $sel("script[type='text/ak-template']");
    for ( var i  = 0; i < templates.length; ++i )
        if ( utils.getAttr(templates[i], 'for') == 'progress' )
            forms.doTemplate(ak.context, templates[i]);
}

forms.onPrefillerLoaded = function() {
    if ( ak.forms.awaitingPrefill ) forms.prefill();
}

forms.prefill = function(overwrite) {
    var prefill_data = ( 
        ( ak.context && ak.context.prefill_data ) 
        ? ak.context.prefill_data 
        : ak.args
    );
    if ( prefill_data.form_name ) 
        forms.setForm(prefill_data.form_name);
    $(ak.form).deserialize(prefill_data, {overwrite: false});
    
    // Check/uncheck boxes, which deserialize() won't do
    $(ak.form).find('input:checkbox').each(function() {
        this.checked = prefill_data[this.name] ? true : false;
    })

    // checking for true, not just present
    if ( prefill_data['amount_other'] ) {
        $(ak.form).find('input.amount_radio_button').attr('checked', false)
        $(ak.form).find('input[name=amount_other]').click()
    }

    // fire onchange and onclick, for in-field labels etc.
    // unfortunately #id_subscription_consent's onchange turns on
    // suppress_subscribe, so leave it out.
    $(ak.form).find(':input:not(#id_subscription_consent)').change();
    $(ak.form).find(':input[checked]').each(function(){ $(this).click(); 
                                                        $(this).change(); });
}

forms.loadText = function() {
    if ( ak.textLoading ) return;
    var relative_url = '/text/' + (ak.context.lang_id || 'default') + '?callback=actionkit.forms.onTextLoaded&rand_id=' + Math.random();
    var textUrl = forms.contextRoot.replace('/context/', relative_url);
    ak.textLoading = 1;
    forms.createScriptElement(textUrl);
}

forms.onTextLoaded = function(text) {
    forms.text = text;
}

forms.createScriptElement = function(url, attrs) {
    var script = document.createElement('script');
    script.type = 'text/javascript';
    if ( attrs )
        for ( name in attrs )
            if ( attrs.hasOwnProperty(name) )
                $(script).attr(name, attrs[name]);
    document.getElementsByTagName('head')[0].appendChild(script);
    script.src = url;
}

// Used by admin.  Give an anonymous callback a name, make a
// call for JSON like the /context and /text calls
var max_callback_id = 0;
forms.loadJSON = function(url, args, fn, err) {
    var callback_id = ++max_callback_id;
    var callback_name = 'actionkitCallback' + callback_id;
    window[callback_name] = fn;
    var err_callback_name = 'actionkitError' + callback_id;
    if (err) window[err_callback_name] = err;
    if (!args) args = {};
    args.callback = 'window.' + callback_name;
    url_with_args = url + '?' + utils.makeQueryString(args);
    forms.createScriptElement(
        url_with_args, 
        err ? {onerror: err_callback_name + '()'} : {}
    );
};

forms.handleQueryStringErrors = function() {
    // Load up errors from the query string into ak.errors and display them
    var errors = {}
    if ( ak.args.form_name )
        forms.setForm( ak.args.form_name );
    
    // Deal with forms in initially-hidden fieldsets on event pages
    // But don't crash if there's no form
    if ( ak.form ) {
        $(ak.form).show();
        $(ak.form).closest('fieldset').show();
    }

    // This can be called before page is loaded, e.g., while init'ing a 
    // signup form in the top toolbar.  If that happens, the form we're 
    // looking for won't exist yet.  If that happens, bail quietly.
    var cur_form_name = ak.form && utils.getAttr(ak.form, 'name');
    if ( ak.args.form_name 
         && (!ak.form || ak.args.form_name != cur_form_name) ) return;
    
    for (key in actionkit.args) {
        match = /^(error|message)_(.*)/.exec(key)
        if ( !match ) continue;
        error_name = match[2];
        error_html = ak.args[key];

        // Don't insert HTML tags from ak.args because that'd allow XSS.  
        if ( /</.test(error_html) ) {
            // To not break existing custom error msgs with links, try to
            // get the error message from a hidden field if it's stored
            // there.
            var error_from_page = 
                forms.errorMessage(error_name);
            if ( error_from_page ) {
                error_html = error_from_page;
            }
            // Failing that, strip the HTML out of the error from the args.
            else {
                error_html = error_html.replace(/<.*?>/g, '');
                error_html = error_html.replace(/</g, '');
            }
        }

        errors[error_name] = error_html;
    }
    if ( utils.hasAnyProperties(errors) ) {
        ak.errors = errors;
        ak.forms.onValidationErrors(errors);
    }
}

/* Set akid, source, etc. in form, do "Not Bob?" if needed */
forms.onContextLoaded = function(context) {
    if ( context.form_name )
        forms.setForm(context.form_name);
    
    if ( ak.context ) return;
    
    var start = (new Date()).getTime()
    
    ak.context = context;
    
    // Force UTF-8 if browser's been forced onto a different encoding
    if ( document.characterSet != 'UTF-8' && !ak.form.utf8 )
        utils.appendHiddenInput('utf8', '\u2714');
    
    // Don't recognize the user in certain situations:
    // * No name passed in context (no akid or logged in user, or no user name)
    // * 'incomplete' in context (step 1 of call or LTE action)
    // * ?nr=1 in query string
    // * <input type="hidden" name="never_recognize"> in the form
    var recognize = ak.context.recognized_user = ( 
        context.name
        && !context.missing_user_fields 
        && !context.incomplete
        && !ak.args.nr
        && !ak.form.never_recognize
    );
    
    // If we require some fields via hidden inputs, and they're blank, don't
    // recognize.
    if ( recognize && context.blank && ak.form.required ) {
        var required = forms.required()
        var blankSet = utils.makeSet(context.blank)
        for ( var i = 0; i < required.length; i++ )
            if ( required[i] in blankSet )
                recognize = false;
    }
    
    $(document.body).addClass(recognize ? 'user-known' : 'user-unknown');

    var referring_akid = ak.args.referring_akid;

    var unknownUser = $sel('#unknown_user, .unknown_user')
    var knownUser = $sel('#known_user, .known_user')
    
    // This works around a problem with using .find() after using a selector
    // containing commas (jQuery just concats the selectors, gets wrong
    // results)
    if ( unknownUser.length ) unknownUser = $(unknownUser[0]);
    if ( knownUser.length ) knownUser = $(knownUser[0]);
    
    if ( recognize ) {
        utils.appendHiddenInput('akid', ak.args.akid);
        $sel('#known_user_name, .known_user_name').text(context.name);

        // move required action field boxes into known_user, if client left
        // the original html structure mostly alone
        var requiredActionFieldBoxes = unknownUser.find('[id^=id_action_].required');
        knownUser.append(requiredActionFieldBoxes);

        // only show known_user
        unknownUser.hide();
        knownUser.show();

        // remove() to remove any fields that browsers may autofill
        unknownUser.find('input:not([type="hidden"]),textarea,select').remove();

        if ( ak.args.action_id )
            $sel('#ak-logout, .ak-logout').hide();
    }
    else {
        if ( ak.args.akid )
            referring_akid = ak.args.akid;
        unknownUser.show();
        knownUser.hide();
    }

    ak.form.style.display = 'block';

    if ( referring_akid )
        utils.appendHiddenInput('referring_akid', referring_akid);

    if ( ak.args.source )
        utils.appendHiddenInput('source', ak.args.source);
    if ( ak.args.action_id 
         && !(ak.form.action_id && ak.form.action_id.value) )
        utils.appendHiddenInput('action_id', ak.args.action_id);
    if ( ak.args.update )
        utils.appendHiddenInput('update', ak.args.update);

    utils.appendHiddenInput('form_name', ak.form_name);
    if ( !$sel('input[name=url]').length )
        utils.appendHiddenInput('url', window.location);
    
    utils.appendHiddenInput('js', 1);
    
    if ( context.required )
        for ( var i = 0; i < context.required.length; ++i )
            utils.appendHiddenInput('required', context.required[i]);
    
    if ( context.incomplete )
        utils.appendHiddenInput('status', 'incomplete');
    
    if ( context.targets )
        forms.onTargets();
    
    context.args = ak.args;
    context.capitalize = ak.utils.capitalize;
    context.add_commas = ak.utils.add_commas;

    if ( ak.form.want_progress && !context.progress )
        forms.loadProgress();

    // For old templates, avoid an error when context.progress is 
    // missing
    if ( !context.progress ) context.progress = {
        'goal': undefined,
        'total': undefined
    };

    var templates = $sel("script[type='text/ak-template']");
    for ( var i = 0; i < templates.length; ++i )
        forms.doTemplate(context, templates[i]);

    if ( typeof($.fn.deserialize) == 'function' )
        actionkit.forms.prefill();
    else
        actionkit.forms.awaitingPrefill = 1;

    if ( context.text )
        forms.text = context.text;
    else
        forms.loadText();

    forms.handleQueryStringErrors();

    // move up below-fold content
    var mobile_lead = $('.ak-mobile-lead:visible');
    if ( mobile_lead.length )
        mobile_lead.prepend($('.ak-abovefold'))
            // explicit style ensures it's not hidden if you enlarge browser
            .css('display','block');
        
    // Figure out if this browser does box-sizing, and fake it if not
    utils.applyBoxSizingFix(':visible');
    
    // Overlay labels on any widgets generated by templates.
    // You could do the same for live validation, but no default tmpl needs 
    // that.
    if ( $('.ak-labels-overlaid, .labels-overlaid').length )
        forms.installOverlayLabelHandler();
        
    // Run client hooks
    if ( window.actionkitFormReady ) actionkitFormReady();
    if ( window.actionkitUserRecognized && recognize ) 
        actionkitUserRecognized();
    if ( window.actionkitUserFormShown && !recognize ) 
        actionkitUserFormShown();

    if ( window.startTime )
        $log(((new Date()).getTime() - window.startTime) + 'ms');
    
    if ( checks.shouldRunChecks() )
        checks.runChecksAndShow();
};
  
var checksTimedOut = false;
window.setTimeout(function() {
    checksTimedOut = true;
    if ( checks.shouldRunChecks() )
        checks.runChecksAndShow();
}, 5000);

forms.doTemplate = function(context, elem) {
    var forElem = utils.getAttr(elem, 'for');
    try {
        var html = utils.template(elem.innerHTML, context);
        $id(forElem).innerHTML = html;
    }
    catch(e) {
        // Should this complain more loudly?
        $log('Template exception (id: ' + forElem + ')');
        $log(e);
    }
};

forms.onTargets = function() {
    var targets = ak.context.targets;

    targets.pl = function(singular, plural) { 
        return targets.plural ? plural : singular;
    }
    targets.s = targets.pl('', 's');
    targets.es = targets.pl('', 'es');

    var target_form = $id('target_checkboxes');
    if (target_form && targets.checkboxes_html) 
        target_form.innerHTML = targets.checkboxes_html;
    
    var target_listing = $id('target_listing');
    if (target_listing && targets.listing_html) 
        target_listing.innerHTML = targets.listing_html;
};

forms.eventSearch = function(form, args) {
    var qs, page;
    if ( form ) {
        if ( form.url ) form.url.value='';
        qs = $(form).serialize();
        page = form.page.value;
    }
    else {
        qs = utils.makeQueryString(args);
        page = args.page;
    }
    qs += ('&callback=actionkit.forms.onEventSearchResults'
           + '&r=' + Math.random());
    var search_root = actionkit.forms.contextRoot.replace(
        '/context/',
        '/cms/event/' + page + '/search_results/?'
    );
    actionkit.forms.createScriptElement(search_root + qs);
    return false;
}

forms.onEventSearchResults = function(html) {
    $sel('#event-search-results, .event-search-results').html(html);
}
    
forms.logOut = function() {
    var args = ak.args;
    args['referring_akid'] = args['akid'];
    delete args['akid'];
    if (!args['referring_akid']) {
        // If there's no akid, log user out w/ /logout
        var next = window.location.pathname + '?' + utils.makeQueryString(args);
        window.location.href = '/logout/?next=' + utils.escapeForQueryString(next); 
    }
    else {
        // Rest of the time, just remove akid arg
        window.location.search = '?' + utils.makeQueryString(args);
    }
    return false;
};

var validators = {};

validators.email = function() {
    if ( !/^\s*\S+@\S+\.\S+\s*$/.test(this.value) )
        return forms.errorMessage(this.name + ':invalid');
    return true;
};

validators.taf_emails = function() {
    if ( !/\w\S+@\S+\.\w+/.test(this.value) )
        return forms.errorMessage(this.name + ':missing')
    return true;
};

validators.zip = function() {
    if ( ak.form.country && utils.val(ak.form.country) != 'United States' ) 
        return true;
    if ( !/\d{5}/.test(this.value) )
        return forms.errorMessage('zip:invalid')
    return true;
};

validators.postal = validators.zip;

validators.phone = function() {
    if ( ak.form.country && utils.val(ak.form.country) != 'United States' ) 
        return true;
    if ( !/^.*\d{3}.*\d{3}.*\d{4}.*/.test(this.value) ) 
        return forms.errorMessage(this.name + ':invalid');
    return true;
};

validators.mobile_phone = 
    validators.home_phone = 
    validators.work_phone = 
    validators.emergency_phone = 
        validators.phone;

validators.event_max_attendees = function() {
    if (!/^\d*$/.test(this.value))
        return(forms.errorMessage(this.name + ':invalid'));
    return true;
}

// Will need love for international dates/times
forms.dateFormat = 'mm/dd/yy';
forms.dateRegexp = /^[01]?\d\/[0-3]?\d\/\d\d\d\d$/;

validators.date = function() {
    // Regexp catches some invalid dates datepicker does not
    var valid = !!forms.dateRegexp.test(this.value);
    // If jQuery datepicker is available, do extra validation
    if ( valid && $.datepicker ) {
        try { 
            $.datepicker.parseDate(forms.dateFormat, this.value)
        }
        catch (e) {
            valid = false;
        }
    }
    if ( valid ) return true;
    else return forms.errorMessage(this.name + ':invalid');
}

forms.timeRegexp = /^[01]?\d(:[0-5]\d)?$/;

validators.time = function() {
    if (forms.timeRegexp.test(this.value)) return true;
    else return forms.errorMessage(this.name + ':invalid');
}

forms.defaultValidators = validators;

forms.required = function() {
    var required = [];
    
    // E-mail and country are always required
    if ( !ak.form ) {
        required = ['email', 'country'];
    }
    else {
        if ( ak.form.email ) required.push('email');
        if ( ak.form.country ) required.push('country');
    }

    var required_inputs = 
        ak.form.elements.required ? utils.list(ak.form.elements.required) : [];
    for ( var i = 0; i < required_inputs.length; ++i )
        required.push(required_inputs[i].value);
    
    // Make ZIP/postal and state/region interchangeable
    required = forms.fixStateAndZipRequirement(required);
    
    return required;
};

forms.fixStateAndZipRequirement = function(required) {
    for (var i = 0; i < required.length; ++i) {
        if ( required[i] == 'zip' && !ak.form.zip )
            required[i] = 'postal';
        if ( required[i] == 'postal' && !ak.form.postal )
            required[i] = 'zip';
        if ( required[i] == 'state' && !ak.form.state )
            required[i] = 'region';
        if ( required[i] == 'region' && !ak.form.region )
            required[i] = 'state';
    }
    // We can't require region and postcode everywhere, so don't
    if ( !forms.isUnitedStates() ) {
        required = $.grep(required, function(field_name) {
            return !/^(zip|postal|state|region)$/.test(field_name)
        });
    }
    return required;
}

forms.validate = function(field) {
    var errors = {};
    if ( field ) {
        // Keep previous errors
        errors = ak.errors || {};
        // Remove this error though
        for ( k in errors )
            if ( k.split(':')[0] == field )
                delete errors[k]
    }
    var required = forms.required();
    
    // submitting a donation to paypal or via the hub requires nothing.
    // we'll assume we're doing it if paypal=1, payment_method=paypal, or
    // payment_method=hub.  (or, more oddly, paypal=paypal, paypal=hub or
    // payment_method=1.)
    // 
    // using serialize() works around IE behavior for hidden fields and
    // radios.
    var $payment_method = $('[name="paypal"],[name="payment_method"]');
    if(!! $payment_method.serialize().match('=(paypal|hub|1)'))
        required = [];

    // If we're missing translation data we can't display errors anyway, so just 
    // let the server check
    if ( !forms.text ) return true;
    
    // support form validator that nobody uses :)
    var formValidator = (
        utils.getAttr(ak.form, 'onvalidate') ||
        window.actionkitBeforeValidation
    );
    if ( formValidator && !field ) {
        ak.errors = errors;
        var compiled = utils.compile(formValidator);
        compiled.apply(ak.form, []);
        errors = ak.errors;
    }
    
    // Filter out user fields if appropriate
    if ( ak.form.akid ) {
        var userFieldSet =
            utils.makeSet(['email', 'prefix', 'first_name', 'middle_name', 
                   'last_name', 'suffix', 'name', 'address1', 'address2',
                   'city', 'state', 'zip', 'postal', 'country', 'region',
                   'phone', 'home_phone', 'work_phone', 'mobile_phone']);
        for ( var i = 0; i < required.length; ++i )
            if ( /^user_/.test(required[i]) || 
                 userFieldSet[required[i]] )
                delete required[i];
    }
    
    // Check they're nonblank
    for ( var i = 0; i < required.length; ++i ) {
        if ( typeof(required[i]) == 'undefined' ) continue;

        // Special case: first_name/last_name required but there's only a
        // "name" field
        if ( /^(first|last)_name$/.test(required[i]) 
             && !ak.form[required[i]] ) {
            if ( field && field != 'name' ) continue;
            // Error if only one name was given
            if ( !ak.form.name || !/\S\s+\S/.test(ak.form.name.value) )
                errors['name:first_and_last'] = 
                    forms.errorMessage('name:first_and_last')
            continue;
        }

        if ( required[i] === 'name' && !(ak.form.name && ak.form.name.value)) {
            if (ak.form.first_name && ak.form.first_name.value &&
                ak.form.last_name && ak.form.last_name.value) 
                continue;
        }
        
        if ( field && field != required[i] ) continue;
        
        elem = $('input[name="'+(required[i]||'akdummyname_donotuse')+'"]');
        if (elem && elem.attr('type') == "checkbox") {
            if (!elem.is(":checked")) {
                // checkboxes require special handling since only one
                // needs to be checked
                errors[required[i] + ':missing'] = 
                    forms.errorMessage(required[i] + ':missing')
            }
        } else if (!ak.form[required[i]] || !utils.val(ak.form[required[i]])) {
            // normal fields checked here
            errors[required[i] + ':missing'] = 
                forms.errorMessage(required[i] + ':missing')
        }
    }
	if ( errors['name:missing'] && errors['name:first_and_last'] ) {
		delete errors['name:missing']
	}
    
    // Check validity with onvalidate
    elements = ak.form.elements;
    var required_set = utils.makeSet(required);
    for ( var i = 0; i < elements.length; ++i ) {
            var elem = elements[i];
            if ( field && field != elem.name ) continue;
            var val = utils.val(elem);
            if ( !val && !required[elem.name] ) continue;
            // Temporarily patch up expiration dates on the client
            // Try to tolerate 0211, 02/11, 2/11, 2/2011, 2/20, 022001, 22001
            if ( elem.name == 'exp_date' ) {
                val = val.replace(/\D/g, '');
                val = val.replace(/^(\d?\d)20(\d\d)$/, '$1$2');
                if ( val.length == 3 ) val = '0' + val;
                elem.value = val;
            }
            var validator = utils.getAttr(elem, 'onvalidate');
            if (!validator && utils.getAttr(elem, 'format')) 
                validator = 
                    forms.defaultValidators[
                        utils.getAttr(elem, 'format')
                    ];

            if (!validator) 
                validator = forms.defaultValidators[elem.name];
            compiled = validator && utils.compile(validator);
            if ( !compiled ) continue;
            err = compiled.apply(elem, []);
            // Validator may return false or a string error msg
            if ( typeof(err) == 'string' || !err ) {
                errors[elem.name + ':invalid'] = 
                    typeof(err) == 'string' 
                        ? err 
                        : forms.errorMessage(required[i] + ':invalid');
            }
    }
    
    if (utils.hasAnyProperties(errors)) {
        ak.errors = errors;
        ak.forms.onValidationErrors(errors, field);
        return false;
    }
    ak.errors = undefined;
    forms.clearErrors(field);
    
    // Let forms have a confirm popup that only runs if validation passes
    var onconfirm = (
        utils.getAttr(ak.form, 'onconfirm')
        || window.actionkitBeforeSubmit
    );
    if ( onconfirm && !field )
        return utils.compile(onconfirm).apply(ak.form);
    
    return true;
};

forms.clearErrors = function() {
    ak.errors = undefined;
    if ( ak.form )
        ak.form.className = 
            ak.form.className.replace('contains-errors', '');
    var error_list = $id('ak-errors');
    if ( error_list ) {
        error_list.innerHTML = '';
        error_list.style.display = 'none';
    }
    $('.ak-err').html('').hide(); // clear inline errors too
    var message_list = forms.findConfirmationBox();
    if ( message_list ) {
        message_list.innerHTML = '';
        message_list.style.display = 'none';
    }
    $sel(':input.ak-error, label.ak-error').removeClass('ak-error');
    $sel('.ak-error-row').removeClass('ak-error-row');
    // also delete in-line errors
    $('.ak-error').remove();

};

// log (as JSON) errors, field, action taken (eg did we insert error li)
forms.onValidationErrors = function(errors, field) {
    if (ak.errors) forms.clearErrors();

    if ( window.actionkitValidationErrors ) {
        var hookRes = window.actionkitValidationErrors(errors, field);
        // bail out if hook ended 'return false;', like onclick etc. do
        if ( !hookRes && hookRes !== undefined ) 
            return false;
    }
    
    // Mark the controls bad
    var error_list = $id('ak-errors');
    var message_list = forms.findConfirmationBox();
    
    // If any error can't be shown inline, move them all to the top
    var use_inline_errors = 
      $(ak.form).find('.ak-err-above,.ak-err-below,.ak-err-after').length;
    for ( error in errors ) {
        var inputElem = ak.form[error.split(':')[0]];
        var input = inputElem && $(inputElem);
        var box = 
          input && input.closest('.ak-err-above,.ak-err-below,.ak-err-after');
        if (!box || !box.length) 
            use_inline_errors = false;
    }
    
    if ( window.actionkitValidationError ) {
        
    }
    
    for ( error in errors ) {
        if ( !errors.hasOwnProperty(error) ) continue;

        var li = document.createElement('li');
        li.innerHTML = errors[error];
        var list = (
            /success/.test(error) 
            ? (message_list || error_list) 
            : error_list
        );
        
        // Use a row/group list instead of a global list if needed
        if ( use_inline_errors ) {

          // extract 'email' from email:missing, look it up in form
          var inputElem = ak.form[error.split(':')[0]];
          var input = inputElem && $(inputElem);
          var box = 
            input && input.closest('.ak-err-above,.ak-err-below,.ak-err-after');
          
          // find error list
          var err_list = box.find('ul.ak-err');
          if ( !err_list.length ) {
            var err_list_html = '<ul class="ak-err"></ul>';
            // prepend or append error list per user request
            var is_above = box.hasClass('ak-err-above');
            if (is_above)
              box.prepend(err_list_html);
            else
              box.append(err_list_html);
            err_list = box.find('ul.ak-err');
          }
          list = err_list[0];

        }

        if ( list ) {
            $(list).show();
            list.appendChild(li);
        }
        error = error.split(':')[0];
        if (ak.form && ak.form[error]) {
            $(ak.form[error]).addClass('ak-error');
        } 

        var containing_row = $id('id_' + error + '_row');
        if (containing_row) 
            $(containing_row).className += ' ak-error-row'
    }

    // Mark the labels, too
    var labels = ak.form ? ak.form.getElementsByTagName('label') : [];

    // if inline errors are on, focus first labelled, broken field
    var focus_error_field = use_inline_errors;
    // but never shift focus during live validation
    if ( field ) focus_error_field = false;
    // if an error-y field is already selected, don't move focus
    var activeEl = document.activeElement;
    if ( activeEl && $(activeEl).hasClass('ak-error') )
        focus_error_field = false;

    for ( var i = 0; i < labels.length; ++i ) {
        var label = labels[i];
        var label_target = label.htmlFor && $id(label.htmlFor);
        if ( !label_target ) continue;
        if ( /\berror\b/.test( label_target.className ) ) {
            label.className += ' ak-error';
            
            if ( focus_error_field && "select" in label_target ) {
                // the select() has to happen AFTER validation finishes, or
                // it will trigger live validation and all heck breaks loose.
                var elem_select = 
                    // this ugly wrapper is why JS can't have nice things
                    (function(e) { 
                        return function() { e.select() }
                    })(label_target);
                window.setTimeout(elem_select,0);
                
                focus_error_field = false;
            }
        }
    }
    
    // Scroll so errors are visible
    if (!field) {
        var scrollTarget = $(
            $(':input.ak-error')[0]
            || error_list
            || ak.form
        );
        utils.ensureVisible(scrollTarget);
    }
    
    // Mark the form
    if ( ak.form )
        ak.form.className += ' contains-errors';
    
    // .contains-errors class will make ak-errors divs show even if empty; fix
    $('#ak-errors:empty, .ak-errors:empty').hide();
    
    // Save the errors
    ak.errors = errors;
};

forms.timeout = 3000; // After 3 seconds, assume script tag isn't coming

forms.onTimeout = function() {
    if ( !ak.context ) forms.onContextLoaded({});
};

forms.initPage = function() {
    ak.args = utils.getArgs();
    // hides form
    document.body.className += ' js';  
    // disables ak-nojs styles (fallback for overlay labels)
    document.body.className = document.body.className.replace('ak-no-js','');
    // Disable funky back/forward caching
    if ( !window.onload ) window.onload = function() {};
};

forms.tryToValidate = function() {
    if ( ak.DEBUG ) {
        try {
            return forms.validate(); 
        }
        catch (e) {
            $log(e);
            return false;
        }
    }
    else {
        return forms.validate();
    }
}

forms.formData = {};

forms.setForm = function(form) {
    if (form == 'undefined' || !form) {
        $log('No form passed to set_form');
        return;
    }

    // Check if we're really switching forms
    var cur_form_name = ak.form && utils.getAttr(ak.form, 'name');
    var new_form_name = ak.form_name = (
        typeof form == 'string' ? form : utils.getAttr(form, "name")
    );
    if ( cur_form_name == new_form_name ) return;

    // Switch on new $sel behavior iff there are 2+ forms
    if ( cur_form_name && new_form_name ) ak.multiForms = true;
    
    // Stash current context/errors/whatever
    if ( cur_form_name )
        forms.formData[cur_form_name] = {
            context: ak.context,
            errors: ak.errors
        };
    
    // Get new form
    //
    // need to do this the hard way since getElementsByName will get
    // fooled in IE into picking up the <div id='taf'>
    var all_forms = document.getElementsByTagName('form');
    if ( all_forms.length == 0 ) 
        // don't break if asked for a nonexistent form
        return;
    ak.form = undefined;
    for(var i=0; i<all_forms.length; i++) {	 
        if(utils.getAttr(all_forms[i], "name") == new_form_name) {
           ak.form = all_forms[i];
           break;
        }
    }
    var stashed = forms.formData[new_form_name] || {};

    // And get context/errors corresponding to the other form
    ak.context = stashed.context;
    ak.errors = stashed.errors;
}

forms.overlayLabelSelector = (
  '.ak-labels-overlaid :input:not(.no-overlay), ' +
  '.labels-overlaid :input:not(.no-overlay), ' +
  '.ak-labels-overlaid textarea:not(.no-overlay), ' +
  '.labels-overlaid textarea:not(.no-overlay)'
);

forms.getLabel = function(input) {
    // Work around the default state_select's inconsistent ID
    // new jQuery requires nonempty attribute value
    return $('label[for='+ (input.id || 'akdummyid_donotuse') + '], label[for=id_' + (input.name || 'akdummyname_donotuse') + ']');
}

// Hide overlay label if content present, and for <select>s
forms.checkForContent = function() {
    var l = forms.getLabel(this);

    // Selects just use blank <option>s as pseudo-labels and that's that.
    var is_select = 'selectedIndex' in this;
    if ( is_select ) return l.hide();

    // Make mouse cursor look right
    l.css('cursor','text').css('pointer-events','none')
    // Hide if there' scontent
    if ( is_select || $(this).val() ) 
      l.addClass('has-content');
    else
      l.removeClass('has-content');
}

forms.installOverlayLabelHandler = function() {
    var getLabel = forms.getLabel, checkForContent = forms.checkForContent;
    $(forms.overlayLabelSelector).not(
      '.ak-has-overlay'
    ).focus(function() {
      getLabel(this).addClass('active');
      if ( $(this).is('select') )
        // selects only fire a focus event when you click 'em, so hide label
        // on focus for them
        getLabel(this).addClass('has-content');
    }).blur(function() {
      getLabel(this).removeClass('active');
      checkForContent.apply(this);
    }).bind('keydown', function() {
      getLabel(this).addClass('has-content');
    }).bind('dragenter', function() {
      getLabel(this).addClass('has-content');
    }).bind('dragleave', function() {
      var me = this;
      setTimeout(function() {
        checkForContent.apply(me);
      },1)
    }).bind('change', 
      checkForContent
    ).bind('keyup', 
      checkForContent
    ).addClass(
      'ak-has-overlay'
    );
    
    // This gets the labels hidden even when the browser prefills because you 
    // pressed Back
    $(forms.overlayLabelSelector).each(checkForContent);
}

// Set a validation hook, request context
// Note initTafForm/initValidation (same thing) are used
// for forms that don't need context
forms.initForm = function(form_name) {
    forms.setForm(form_name);

    /* if we're on a login screen or other non-page view, skip this step. */
    if ( ! ak.form ) { return }

    window.setTimeout(forms.onTimeout, 5000);
    if ( !ak.form.onsubmit ) 
        ak.form.onsubmit = function() {
            forms.setForm(form_name);
            var result = forms.tryToValidate();
            return result;
        }
    if ( ak.args.prefill || ak.args.want_prefill_data )
        forms.loadPrefiller();
    forms.loadContext();
    // overlay labels
    if ( $('.ak-labels-overlaid, .labels-overlaid').length )
        forms.installOverlayLabelHandler();
    // inline errs
    if ( $('.ak-errs-above,.ak-errs-below,.ak-errs-after').length )
        forms.installLiveValidation();
    // if both U.S. fields (ZIP/state) and int'l (postal/region) exist, switch
    // which ones we show
    if ( (ak.form.zip && ak.form.postal)
         || (ak.form.state && ak.form.region) ) {
        $(ak.form.country).change(forms.reflectCountryChange);
        forms.reflectCountryChange();
    }
    // auto country if they want it
    if ( ak.form.auto_country
         && !ak.args.prefill 
         && !ak.args.want_prefill_data 
         // DISABLE because Google rarely has a useful country for us
         && false) {
          forms.createScriptElement(
            '//www.google.com/jsapi?callback=actionkit.forms.onCountryGuessReady'
          );
    }
    // fix IE7 layout even before context load
    utils.applyBoxSizingFix(':visible');
};

forms.installLiveValidation = function() {
    // errors
    $('.ak-errs-above :input').parent().addClass('ak-err-above');
    $('.ak-errs-below :input').parent().addClass('ak-err-below');
    $('.ak-errs-after :input').parent().addClass('ak-err-after');

    $('.ak-err-above,.ak-err-below,.ak-err-after')
      .find(':input[name]')
      .change(function() { forms.validate(this.name) })
      .blur(function() { forms.validate(this.name) });
}

forms.onCountryGuessReady = function() {
    var google_country = window.google && google.loader && google.loader.ClientLocation && google.loader.ClientLocation.address && google.loader.ClientLocation.address.country;
    var substs = { 'USA': 'United States' };
    google_country = substs[google_country] || google_country;
    if ( ak.form.country.selectedIndex == 0
         && $(ak.form.country).val() != google_country ) {
        $(ak.form.country).val(google_country);
        // Old IEs will actually create a blank option with -1 selectedIndex.
        // That's wild, but we'd rather just leave the default selected.
        if ( ak.form.country.selectedIndex < 0 )
            ak.form.country.selectedIndex = 0;
        $(ak.form.country).change();
    }
}

// Get the div or p or whatever for an input (as a jQuery object) or undefined
forms.getRowForElement = function(el) {
    // Look for .ak-field so author can pick an element explicitly
    var byClass = $(el).closest('.ak-field');
    if ( byClass.length ) return byClass;
    
    // Else use parent if "safe" (if parent has no other inputs)
    var parent = $(el.parentNode);
    var siblings = parent.find(':input');
    if ( siblings.length == 1 ) return parent;

    // Else we don't know; just return
    return $([]);
}

// Show postal and hide zip on country change, for instance
forms.showAndHide = function(toShow,toHide) {
    var $show = $(toShow);
    var $hide = $(toHide);

    // don't do anything if show is already visible and hide is
    // already invisible
    if ($show.is(':visible') && !$hide.is(':visible')) {
        return;
    }

    // if there's a value in the field we're hiding, copy it
    // to the one we're showing
    $show.removeAttr('disabled');
    if ( $show.val() != $hide.val() && $hide.val() ) {
        $show.val($hide.val());
        $show.change();
    }
    $hide.attr('disabled', true);
    var shownRow = forms.getRowForElement(toShow);
    shownRow.show();
    var hiddenRow = forms.getRowForElement(toHide);
    hiddenRow.hide();
}

forms.reflectCountryChange = function() {
    var is_us = forms.isUnitedStates();
    var zip = ak.form.zip, postal = ak.form.postal, 
        state = ak.form.state, region = ak.form.region;
    if ( zip && postal ) {
        if ( is_us ) forms.showAndHide(zip,postal);
        else forms.showAndHide(postal,zip);
    }
    if ( state && region ) {
        if ( is_us ) forms.showAndHide(state,region);
        else forms.showAndHide(region,state);
    }
}

// Find .ak-confirmation or .[form-name]-confirmation
// Gotcha: box can be outside the <form>, 'cause sometimes we want the
// message on *top* of a page with many forms (event host page) or no
// form ("your event is cancelled" page) 
forms.findConfirmationBox = function() {
    // Form-specific confirmation, in or out of form
    var confirmation_box = $('#' + ak.form_name + '-confirmation')[0];
    // ak-confirmation in the form
    if ( !confirmation_box )
        confirmation_box = $id('ak-confirmation');
    return confirmation_box;
}

// Set validation hook, insert akid/action_id, but don't
// request context.  Used for TAF forms and other forms 
// that just want validation, not recognizing user etc.
forms.initValidation = function(form_name, context) {
    forms.setForm(form_name)
    
    // Just show errors/confirmations if there's no form
    if ( !ak.form )
        return forms.handleQueryStringErrors();
    
    if ( ak.args.akid )
        utils.appendHiddenInput('akid', ak.args.akid);
    if ( ak.args.action_id 
         && !(ak.form.action_id && ak.form.action_id.value) )
        utils.appendHiddenInput('action_id', ak.args.action_id);
    if ( !ak.form.onsubmit ) 
        ak.form.onsubmit = function() {
            forms.setForm(form_name);
            return forms.tryToValidate();
        }
    // Unhide confirmation if this might be TAF success
    if ( ak.args.did_taf 
        && forms.findConfirmationBox()
        && ((!ak.form_name) || ak.form_name == ak.args.form_name)) {
        $(forms.findConfirmationBox()).show();
    }
    if ( ak.args.prefill || ak.args.want_prefill_data )
        forms.loadPrefiller();
    forms.onContextLoaded(context || {})
    // overlay labels
    if ( $('.ak-labels-overlaid, .labels-overlaid').length )
        forms.installOverlayLabelHandler();
    // inline errs
    if ( $('.ak-errs-above,.ak-errs-below,.ak-errs-after').length )
        forms.installLiveValidation();
    // layout hack f/IE7
    utils.applyBoxSizingFix(':visible');
}

// Other forms besides TAF can use the "lite" setup
forms.initTafForm = forms.initValidation;


// CHECKS -- find and show things potentially wrong with the page
// runs in response to ?debug=1 or akdebug=1 cookie
// 
// wrong version of jQuery
// JavaScript errors
// visible field names not in expected set
// no initForm
// 
// anything of the form checks.checkFoo will run as a check
// checks return an error as a jQuery object or plain-text string, a list of errors, or undefined if all is good

checks.shouldRunChecks = function() {
    return /akdebug=1/.test(window.location.search) || /akdebug=/.test(document.cookie);
}

checks.runChecksAndShow = function() {
    if ( window.actionkitChecksRan ) return;
    window.actionkitChecksRan = 1;
    checks.displayWarnings(checks.runChecks())
}

checks.runChecks = function() {
    var results = [];
    if ( actionkit.admin ) return;
    for (name in actionkit.checks) {
        if ( !/^check/.test(name) ) continue;
        try {
            var result = actionkit.checks[name]();
        } catch (e) {
            $log('Check ' + name + ' died: ' + e + ", continuing");
        }
        if (typeof result === "undefined") continue;
        results.push(result);
    }
    return results;
}

// should all checks run at a given time?
// like after onContextReady returns or after an n-second timeout?

var warningTmpl = "<div><div class=\"ak-checks-nub ak-checks-[%= warnings.length ? 'bad' : 'ok' %]\">\n<div class=\"ak-unhovered\">\n\t[% if (warnings.length) { %]\n\t[%= warnings.length %] warning[%= warnings.length > 1 ? 's' : '' %]\n\t[% } else { %]\n\tNo warnings\n\t[% } %]\n</div>\n<div class=\"ak-hovered\">\n\t[% if (warnings.length) { %]\n\t\t<div class=\"ak-nub-title\">Check your form:</div>\n\t\t[% for (var i = 0; i < warnings.length; i++) { %]\n\t\t<div>[%= actionkit.utils.escape(warnings[i]) %]</div>\n\t\t[% } %]\n\t[% } else { %]\n\t\t<div>The page passed some quick checks (which only detect a few kinds of problem).</div>\n\t\t<div><b>There's still no substitute for testing it out yourself!</b></div>\n\t[% } %]\n<a class=\"ak-close-nub\" href=\"#\" onclick=\"this.parentNode.parentNode.style.display='none'; actionkit.checks.hide(); return false;\">Close</a>\n<div>You're seeing this because you logged in or used ?akdebug=1.</div>\n</div>\n</div>\n\n<style>\n.ak-checks-nub {\n\tposition: fixed;\n\tright: 0px;\n\tbottom: 0px;\n\tmargin: 0px;\n\tborder-width: 3px 0px 0px 3px;\n\tborder-style: solid;\n\tpadding: 0px 5px;\n\tfont-size: 13px;\n\tmax-width: 600px;\n}\n.ak-checks-nub, .ak-checks-nub * {\n\tfont-family: sans-serif !important; /* ignore page font */\n}\na.ak-close-nub {\n\tfloat: right;\n}\n.ak-checks-nub .ak-nub-title { font-weight: bold; }\n.ak-checks-nub .ak-hovered { display: none; width: 600px;}\n.ak-checks-nub .ak-unhovered { display: block; }\n.ak-checks-nub:hover .ak-hovered { display: block; }\n.ak-checks-nub:hover .ak-unhovered { display: none; }\n.ak-checks-bad {\n\t/* applied to bad inputs and labels as well as the nub */\n\tbackground-color: rgba(255,128,0,.75);\n\tborder-color: rgb(255,128,0);\n}\n.ak-checks-ok {\n\tbackground-color: rgba(0,210,0,.75);\n\tborder-color: rgb(0,210,0);\n}\n</style></div>"

// tries not to rely on jQuery because it's supposed to report incompatible jQuery, etc.!
checks.displayWarnings = function(warnings) {
    var html = utils.template(warningTmpl, {warnings: warnings});
    utils.div.innerHTML = html;
    document.body.appendChild(utils.div.firstChild);
}

checks.hide = function() {
    if ( window.$ ) 
        $('.ak-checks-bad').removeClass('ak-checks-bad');
}

checks.checkjQuery = function() {
    var version = window.$ && window.$.fn && window.$.fn.jquery;
    if ( !version )
        return "actionkit.js requires jQuery, but jQuery didn't load successfully";
    if ( version >= '2' )
        return "actionkit.js isn't compatible with jQuery 2";
}

var akErrCount = 0;

checks._onerror = function(evt){
	var akre = /actionkit/;
	if (evt.filename && akre.test(evt.filename)) {
		akErrCount++;
		return
	}
	var errObj = evt.error;
	try {
		if (errObj && errObj.stack && akre.test(errObj.stack)) {
			console.log(errObj)
			akErrCount++;
			return;
		}
	} catch(e) {
	        // Firefox 38 gives permission denied errors trying to read
	        // the stack, so don't crash again when that happens
	}
}

try {
    window.addEventListener("error", checks._onerror, false);
} catch(e) {
    $log("could not add event listener: " + e + ", continuing");
}

checks._die_in_ak_js = function() { throw '_die_in_ak_js called'; }

checks.checkErrors = function() {
    // we should improve this with links to instructions f/opening console
    if ( !akErrCount ) return;
    var msg;
    if ( akErrCount == 1 )
	msg = 'Caught a JavaScript error affecting ActionKit';
    else
        msg = 'Caught ' + errCount + ' JavaScript errors affecting ActionKit';
    msg += '. Your browser\'s dev tools have more info.'
    return msg;
}

checks.checkFields = function() {
    if (!actionkit.context || !actionkit.context.allowed_fields)
        // we don't have enough info to run this check
        return;
    var expected = actionkit.context.allowed_fields;
    
    var unexpected = [];
    $(ak.form).find('input:visible').each(function() {
        var field = this;
        var name = field.name;
        if (name in expected) return;
        if (field.disabled || !name) return;
        if (/^((user|action|braintree|stripe|event|product|candidate|field|error)_|(error_response|manage|response)-)/.test(name)) return;
        if (/^(file|reset|submit|button)$/i.test(field.type)) return;
        
        $(field).addClass('ak-checks-bad');

        // for radios and checkboxes, border/bg don't matter (in
        // chrome)--try styling the parent node, or the label if the parent
        // is shared w/other fields
        if ( /^(radio|checkbox)$/.test(field.type) ) {
            var $highlightElem;
            var $parent = $(field).parent();
            if ( $parent.find('input').length == 1 ) {
                $highlightElem = $parent;
            } else {
                $highlightElem = $('label[for="' + field.name + '"]')
            }
	    $highlightElem.addClass('ak-checks-bad');
        }
        
        unexpected.push(name);
    });
    
    if (!unexpected.length) return;
    
    if (unexpected.length == 1) 
        return "Unexpected field name " + unexpected[0] + ". Maybe it needs user_ or action_ in front?";
    else
        return "Unexpected field names " + unexpected.join(', ') + ". Maybe they need user_ or action_ in front?";
}

// UTILS
// some of these are pre-jQuery and just never got torn out
// if you think you don't need to use one of these, you're probably right

utils.getById = $id;

utils.escapeForQueryString = function(str) { 
    esc = escape;
    if ( typeof(encodeURIComponent) != 'undefined' )
        esc = encodeURIComponent;
    return esc(str).replace(/\+/g, '%2B'); 
};

utils.makeQueryString = function(args) {
    if (!args) return '';
    var encoded = [];
    for ( key in args ) {
        if ( !args.hasOwnProperty(key) ) continue;
        var item = args[key];
        if ( typeof(item) == 'object' ) {
            for ( var i = 0; i < item.length; ++i )
                encoded.push(key + '=' + 
                    utils.escapeForQueryString(item[i]));
        }
        else { 
            encoded.push(key + '=' + 
                utils.escapeForQueryString(item));
        }
    }
    return encoded.join('&');
};

utils.getArgs = function(argsStr) {
    argsStr = argsStr || window.location.search;
    var pairs = argsStr.replace(/^\?/, '').split('&');
    var args = {};
    unesc = unescape;
    if ( typeof(decodeURIComponent) != 'undefined' )
        unesc = decodeURIComponent;
    for ( var i = 0; i < pairs.length; ++i ) {
        pair = pairs[i].split('=');
        if (pair[0]) {
            if (pair[1])
               pair[1] = unesc(pair[1].replace(/\+/g, ' '));
            args[unesc(pair[0].replace(/\+/g, ' '))] = pair[1];
        }
    }
    return args;
}

// the hub wants to know about empty- or multiple-valued args, too
utils.getListArgs = function(argsStr) {
    argsStr = argsStr || window.location.search;
    var listArgs = {};
    var unesc = window.decodeURIComponent || unescape;

    var pairs = argsStr.replace(/^\?/, '').split('&');
    for ( var i = 0; i < pairs.length; ++i ) {
        pair = pairs[i].split('=');
        
        var key = pair[0] || '';
        key = unesc(key.replace(/\+/g, ' '))
        
        var val = pair[1] || '';
	val = unesc(val.replace(/\+/g, ' '));
	
        if (!key) continue;

	if ( key in listArgs ) {
	    listArgs[key].push(val)
	} else {
	    listArgs[key] = [val]
	}
    }

    return listArgs;
}




utils.div = document.createElement('div');

utils.escape = function(text) {
    utils.div.textContent = text;
    return utils.div.innerHTML;
}

utils.makeHiddenInput = function(name, value) {
    // InnerHTML trick is needed to make MSIE work
    utils.div.innerHTML = '<input type="hidden" name="' + name + '" />';
    var input = utils.div.firstChild;
    input.value = value;
    return input;
};
    
utils.appendHiddenInput = function(name, value) {
    if (typeof(ak) != 'undefined' && typeof(ak.form) != 'undefined') {
        ak.form.appendChild(utils.makeHiddenInput(name, value))
    }
};
    
utils.makeSet = function(list) { 
    var s = {}; 
    for ( var i = 0; i < list.length; ++i ) 
        if ( typeof(list[i]) != 'undefined' )
            s[list[i]] = 1;
    return s;
}
    
utils.getAttr = function(element, attribute) {
    return ( element.attributes && element.attributes[attribute] )
        ? element.attributes[attribute].nodeValue
        : element[attribute];  // for Safari
}

utils.hasAnyProperties = function(o) {
    for ( property in o )
        if ( o.hasOwnProperty(property) )
            return true;
    return false;
}

utils.list = function(i) {
    if (typeof(i[0]) == "undefined")
        return [i];
    else return i;
}

utils.val = function(e) {
    if ( e.tagName && e.tagName.toLowerCase && 
            e.tagName.toLowerCase() == 'select' ) {
        return $(e).val();
    } else if (e[0] && e[0].type == "radio") {
        return $(e).filter(":checked").val();
    } else if (e[0] && e[0].type == "checkbox") {
        return $(e).filter(":checked").val();
    } else {
        return e.value;
    }
}

utils.compile = function(code, paramlist) {
    // "false ||" works around MSIE behavior
    if ( typeof(code) == 'function' ) return code;
    if ( !paramlist ) paramlist='';
    return eval('false || function(' + paramlist + '){' + code + '}');
}

utils.capitalize = function(str) {
    return str.replace(/^(.)/, function(m) {return m.toUpperCase()} )
}

utils.addCommas = utils.add_commas = function(str, comma) {
    str = '' + str;
    if (!comma) comma = ',';
    while (/^([^\.\,]*\d)(\d{3})/.test(str))
        str = str.replace(/^([^\.\,]*\d)(\d{3})/, 
                          function(all, left, right) { 
                              return left + comma + right 
                          })
    return str;
}

utils.currencySymbols = {
    'USD': "$", 
    'GBP': "\u00a3",
    'JPY': "\u00a5",
    'EUR': "\u20ac",
    'AUD': "AUD",
    'CAD': "CAD",
    'CZK': "\u004b\u010d",
    'DKK': "\u006b\u0072",
    'HKD': "HKD",
    'HUF': "Ft",
    'NOK': "NOK",
    'NZD': "NZD",
    'PLN': "\u007a\u0142",
    'SGD': "SGD",
    'SEK': "SEK",
    'CHF': "CHF"
};

// JS in Original shows no symbol at all except for listed currencies.
// Patching it may miss some templates in the wild. So, list everything.
utils.allCurrencies = 'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTC BTN BWP BYR BZD CAD CDF CHF CLF CLP CNY COP CRC CUC CUP CVE CZK DJF DKK DOP DZD EEK EGP ERN ETB EUR FJD FKP GBP GEL GGP GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS IMP INR IQD IRR ISK JEP JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LTL LVL LYD MAD MDL MGA MKD MMK MNT MOP MRO MTL MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLL SOS SPL SRD STD SVC SYP SZL THB TJS TMM TMT TND TOP TRY TTD TVD TWD TZS UAH UGX USD UYU UZS VEB VEF VND VUV WST XAF XAG XAU XCD XDR XOF XPD XPF XPT YER ZAR ZMK ZMW ZWD ZWL'.split(' ')
for (var i = 0; i < utils.allCurrencies.length; i++) {
    var sym = utils.allCurrencies[i];
    if ( !(sym in utils.currencySymbols) ) {
        utils.currencySymbols[sym] = sym + ' '
    }
}

utils.formatCurrency = function(amt, iso_code) {
    return utils.currencyPrefix(iso_code) + utils.add_commas(amt)
}

utils.currencyPrefix = function(iso_code) {
    return utils.currencySymbols[iso_code] || (iso_code + ' ')
}

// Simple printf-like '{0} is required', not to be confused with
// templating below
utils.format = function(str) {
    var format_args = arguments;
    var auto_number = 0;
    var arg_replacement = function(all, number) {
        // The lazy can say "{} is {}" instead of "{0} is {1}"
        if (number === '') number = auto_number++;
        return format_args[parseInt(number)+1]
    };
    return str.replace(/\{(\d*)\}/g, arg_replacement);
}

// Apply a static box-sizing fix for IE7. This lets us do stuff like % column
// widths combined with padding on columns, without hacking the HTML.
// 
// Inspired by this more general, but more complicated, fix:
// https://github.com/Schepp/box-sizing-polyfill/blob/master/boxsizing.htc
utils.applyBoxSizingFix = function(selector) {
    // Browser sniff for IE7 or IE8+ in IE7 emulation mode
    // (It's hard to test for box-sizing otherwise.)
    if ( !(navigator.appName == 'Microsoft Internet Explorer'
           && (document.documentMode === undefined 
               || document.documentMode <= 7) ) )
        return;
    
    if ( $(document.body).hasClass('no-ie7-box-sizing') )
        return;

    $(selector).filter(function() {
        var $this = $(this);
        return (
            $this.css('box-sizing') == 'border-box'
            && !this.actionkitBoxFixed // only fix once!
        )
    }).each(function() {
        // have jQuery get us the inner/outer widths in pixels, and use it to
        // figure out what the CSS width needs to be
        this.actionkitBoxFixed = true;
        var $this = $(this);
        // don't apply this to default input height, etc., because box-sizing
        // shouldn't affect them. do apply to explicit sizes: %, px, em...
        if ( parseFloat(this.currentStyle.width) ) {
            var width = $this.width();
            var extraWidth = $this.outerWidth() - width;
            if ( extraWidth && extraWidth < width ) 
                $(this).css('width', (width - extraWidth) + 'px');
        }
        if ( parseFloat(this.currentStyle.height) ) {
            var height = $this.height();
            var extraHeight = $this.outerHeight() - height;
            if ( extraHeight && extraHeight < height ) 
                $(this).css('height', (height - extraHeight) + 'px');
        }
    });
};

// Credit http://bit.ly/11LzOLX
utils.isScrolledIntoView = function($elem) {
    var docViewTop = $(window).scrollTop();
    var docViewBottom = docViewTop + $(window).height();
        
    var elemTop = $elem.offset().top;
    var elemBottom = elemTop + $elem.height();
    
    return ((elemBottom <= docViewBottom) && (elemTop >= docViewTop));
}

// Credit http://bit.ly/AtEFhB, tweaked to return if $elem is an empty
// jQuery obj or already visible
utils.ensureVisible = function($elem) {
    if ( !$elem.length || utils.isScrolledIntoView($elem) ) return;
    $('html,body').animate({scrollTop: $elem.offset().top}, 'fast');
}

// Tweaked for ActionKit to use a more WYSIWYG-friendly syntax:
// [%...%]
// And applied fix for single quotes from 
// http://plugins.jquery.com/node/3694
utils.template = 
// Simple JavaScript Templating
// John Resig - http://ejohn.org/ - MIT Licensed
(function(){
  var cache = {};
  
  this.tmpl = function (str, data){
    // Figure out if we're getting a template, or if we need to
    // load the template - and be sure to cache the result.
    var fn = !/\W/.test(str) ?
      cache[str] = cache[str] ||
        tmpl(document.getElementById(str).innerHTML) :
      
      // Generate a reusable function that will serve as a template
      // generator (and which will be cached).
      new Function("obj",
        "var p=[],print=function(){p.push.apply(p,arguments);};" +
        
        // Introduce the data as local variables using with(){}
        "with(obj){p.push('" +
        
        // Convert the template into pure JavaScript
        str
          .replace(/[\r\t\n]/g, " ")
          .split("\[%").join("\t")
          .replace(/(^|%\])[^\t]*/g, function(text){return text.replace(/['\\]/g, "\\$&")})
          .replace(/\t=(.*?)%\]/g, "',$1,'")
          .split("\t").join("');")
          .split("%\]").join("p.push('")
      + "');}return p.join('');");
    
    // Provide some basic currying to the user
    return data ? fn( data ) : fn;
  };
  
  return this.tmpl;
})();

//create a new updateLinkArgsFromLocation function
var loc_params;
sharing.updateLinkArgsFromLocation = function(e) { 
    $(e).each( function() {        
		// find the local params from the window URL
		loc_params = loc_params || ak.args || utils.getArgs();

        // get the params from the href string value inside the button
        var a_params = utils.getArgs(this.search); 

		// loop through a_params, and for each key, if there's a corresponding
 		// value in loc_params, copy it into a_params
		$.each(a_params, function(k,v) { 
			a_params = $.extend(a_params, loc_params); //merge second object into first object so that it replaces the original values
		});
        
        this.search = '?' + utils.makeQueryString( a_params );
	});
}

sharing.initShareTools = function() {
	$(function() { actionkit.sharing.updateLinkArgsFromLocation('.ak-share-button') });
	$('a.ak-facebook,a.ak-twitter').click(function() {
	  var width  = 575,
	      height = 320;
	  window.open(this.href, this.target, 'status=0' +
	      ',width='  + width  +
	      ',height=' + height +
	      ',top='    + ( window.screenY + ($(window).height() - height)/2 ) +
	      ',left='   + ( window.screenX + ($(window).width()  - width )/2) 
	  );
	  return false;
	});
	$('a.ak-email.ak-share-button').click( function() {} );
	var share_url = $('input.ak-share-url').val();
	var clicked_taf_text = 0;
	function select_taf_text() {
		var input = $(this);
		input.select();
		if ( ! clicked_taf_text ) {
			clicked_taf_text ++;
			var url_regex = new RegExp( share_url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '([?&]?)' );
			if ( input.val().search( url_regex ) ) {
	    		$.ajax( {
	    			url: $('a.ak-share-url').attr('href').replace('type=ot', 'type=em'),
	    			success: function(data) {
	    				input.val( input.val().replace( url_regex, function(m, p1) {
	    				    return data + ( p1 ? '&' : '' )
	    				} ) );
	    				input.select();
	    			}
	    		} )
			}
		}
	}
	$('textarea.ak-share-message').click( select_taf_text );
	$('textarea.ak-share-message').focus( select_taf_text );

	var clicked_share_url = 0;
	function select_share_link() {
		var input = $(this);
		input.select();
		if ( ! clicked_share_url ) {
			clicked_share_url ++;
			$.ajax( {
				url: $('a.ak-share-url').attr('href'),
				success: function(data) {
					input.val( data );
					input.select();
				}
			} )
		}
	}
	$('input.ak-share-url').click( select_share_link );
	$('input.ak-share-url').focus( select_share_link );
	
}

})(window.actionkit, window.actionkit.utils, window.actionkit.forms, window.actionkit.sharing, window.actionkit.checks);
