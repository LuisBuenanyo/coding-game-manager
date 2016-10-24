/* src/main.js
 *
 * Copyright (c) 2016 Endless Mobile Inc.
 * All Rights Reserved.
 *
 * This file is the file first run by the entrypoint to the mission-chatbox
 * package.
 */
pkg.initGettext();
pkg.initFormat();
pkg.require({
    Gdk: '3.0',
    GdkX11: '3.0',
    GdkPixbuf: '2.0',
    Gtk: '3.0',
    Gio: '2.0',
    GLib: '2.0',
    GObject: '2.0',
    Pango: '1.0',
    PangoCairo: '1.0'
});

const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Wnck = imports.gi.Wnck;

const Lang = imports.lang;

const MISSION_MANAGER_NAME = 'com.endlessm.Mission.Manager';
const MISSION_MANAGER_PATH = '/com/endlessm/Mission/Manager';
const MISSION_MANAGER_IFACE = 'com.endlessm.Mission.Manager';
const SIDE_COMPONENT_ROLE = 'eos-side-component';

const MissionManagerIface = '<node><interface name="' + MISSION_MANAGER_NAME + '">' +
  '<method name="show">' +
    '<arg type="u" direction="in" name="timestamp"/>' +
  '</method>' +
  '<method name="hide">' +
    '<arg type="u" direction="in" name="timestamp"/>' +
  '</method>' +
  '<property name="Visible" type="b" access="read"/>' +
'</interface></node>';

const MissionManagerMainWindow = new Lang.Class({
    Name: 'MissionManagerMainWindow',
    Extends: Gtk.ApplicationWindow,
    Template: 'resource:///com/endlessm/Mission/Manager/main.ui',

    _init: function(params) {
        params.title = '';
        this.parent(params);
    }
});

function load_style_sheet(resourcePath) {
    let provider = new Gtk.CssProvider();
    provider.load_from_resource(resourcePath);
    Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(),
                                             provider,
                                             Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
}

const MissionManagerApplication = new Lang.Class({
    Name: 'MissionManagerApplication',
    Extends: Gtk.Application,

    _init: function() {
        this.parent({ application_id: pkg.name });
        GLib.set_application_name(_("Mission Manager"));
        this.Visible = false;
    },

    vfunc_startup: function() {
        this.parent();

        load_style_sheet('/com/endlessm/Mission/Manager/application.css');

        this._window = new MissionManagerMainWindow({
            application: this,
            type_hint: Gdk.WindowTypeHint.DOCK,
            role: SIDE_COMPONENT_ROLE
        });

        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(MissionManagerIface, this);
        this._dbusImpl.export(Gio.DBus.session, MISSION_MANAGER_PATH);

        this._update_geometry();

        this._window.connect('notify::visible', Lang.bind(this, this._on_visibility_changed));

        /* NOTE: At least on VMWare, I'm noticing some bugs here where
         * monitors-changed is being fired when the work-area for the monitor
         * is still the old value and not then new value. We're racing with
         * the shell here because it also needs to update _NET_WORKAREA in
         * response to the monitor layout changing.
         *
         * I'm not sure what to do with this at the moment, so I've filed
         * https://bugzilla.gnome.org/show_bug.cgi?id=773195 . Perhaps the
         * best place to deal with this is in the window manager itself. */
        Gdk.Screen.get_default().connect('monitors-changed', Lang.bind(this, this._update_geometry));
        Wnck.Screen.get_default().connect('active-window-changed', Lang.bind(this, this._on_active_window_changed));
    },

    vfunc_activate: function() {
        /* This does nothing -we should only show when the shell asks us */
    },

    show: function(timestamp) {
        this._window.show();
        this._window.present_with_time(timestamp);
    },

    hide: function() {
        this._window.hide();
    },

    _on_visibility_changed: function() {
        this.Visible = this._window.is_visible();
        let propChangedVariant = new GLib.Variant('(sa{sv}as)', [
            MISSION_MANAGER_IFACE, {
                'Visible': new GLib.Variant('b', this.Visible)
            },
            []
        ]);

        Gio.DBus.session.emit_signal(null,
                                     MISSION_MANAGER_PATH,
                                     'org.freedesktop.DBus.Properties',
                                     'PropertiesChanged',
                                     propChangedVariant);
    },

    _on_active_window_changed: function() {
        let active_window = Wnck.Screen.get_default().get_active_window();
        let current_window = this._window.get_window();
        let active_window_xid = active_window ? active_window.get_xid() : 0;
        let current_window_xid = current_window ? current_window.get_xid() : 0;

        if (active_window_xid !== current_window_xid) {
            this.hide();
        }
    },

    _update_geometry: function() {
        let screen = Gdk.Screen.get_default();
        let monitor = Gdk.Screen.get_default().get_primary_monitor();
        let workarea = screen.get_monitor_workarea(monitor);

        let geometry = {
            width: this._window.get_size()[0],
            height: workarea.height,
            y: workarea.y
        };

        geometry.x = workarea.width - geometry.width;
        this._window.move(geometry.x, geometry.y);
        this._window.resize(geometry.width, geometry.height);
    }
});

function main(argv) { // eslint-disable-line no-unused-vars
    return (new MissionManagerApplication()).run(argv);
}
