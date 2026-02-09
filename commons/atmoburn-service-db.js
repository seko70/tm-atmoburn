/* shared-atmoburn-service-db - shared DB for atmoburn greasemonkey plugins (abs-archivist and more); version 1.1.0 */
// !!! requires Dexie to be loaded before this file

(function (global) {
    'use strict';

    const db = new Dexie('AtmoBurnServicesDB');

    // NOTE: primary key 'id' is per-table.
    db.version(1).stores({
        system: 'id, name',
        world: 'id, name, system',
        colony: 'id, name, world, system, relation',
        fleet: 'id, name, system, relation, signature',
        rp: 'id, name, relation, type',
        wh: 'id, name',
        signature: '&id, name, system, relation',
        relation: '&id, relation',
    });

    // CHANGES: primary key 'id' is now unique, explicitly; Rally Points don't need "relation" and "type" indexes; added name index to relation
    db.version(2).stores({
        system: '&id, name',
        world: '&id, name, system',
        colony: '&id, name, world, system, relation',
        fleet: '&id, name, system, relation, signature',
        rp: '&id, name',
        wh: '&id, name',
        signature: '&id, name, system, relation',
        relation: '&id, name, relation',
    });

    // Be nice during upgrades/races
    db.on('blocked', () => {
        console.warn('Dexie upgrade blocked. Another tab/script holds the old version. Close it or reload.');
    });
    db.on('versionchange', () => {
        // Another context upgraded; close to let it proceed
        db.close();
        console.warn('DB version changed elsewhere. Closed this connection.');
    });

    // expose it
    global.sharedDB = db;
})(typeof window !== 'undefined' ? window : this);
