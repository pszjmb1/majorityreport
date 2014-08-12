var plumber, maps = {}, markers = {};

UI.registerHelper('printObject', function(obj) {
    return JSON.stringify(obj);
});

UI.registerHelper('isValid', function(item) {
    if(item !== undefined || item !== null) {
        if(_.isArray(item) || _.isObject(item)) {
            if(!_.isEmpty(item))
                return true;
            else
                return false;
        } else {
            return true;
        }
    }
    return false;
});

Template.freeform.created = function () {
    Session.set('renderedEntities', []);

    jsPlumb.ready(function() {
        plumber = jsPlumb.getInstance({
            Anchor: 'Continuous',
            DragOptions : { cursor: "crosshair" },
            PaintStyle : {
                lineWidth:13,
                strokeStyle: '#ac8'
            },
            EndpointStyles : [{ fillStyle:"#ac8" }, { fillStyle:"#ac8" }]
        });
    }); 
};

Template.freeform.rendered = function () {
    var _self = this,
        board = this.$('#board');

    board.bind('entityAttributeChange', function() {
        plumber.repaintEverything();
    });

    // draw connections/relations
    var relationsQuery = Provenance.find({ provType: 'MR: Relation', wasInvalidatedBy: { $exists: false} });
    relationsQuery.observe({ 
        added: processRelation,
        changed: processRelation,
    });

    function processRelation(doc) {
        if(doc.mrOrigin === undefined) { return; }

        var connection = plumber.getConnections(doc.mrOrigin);
        if(connection.length > 0) {
            connection = connection[0];
        } else {
            connection = drawRelation(doc);
        }

        if(connection) {
            if(!_.isEmpty(doc.mrAttribute)) {
                var label = _.pairs(doc.mrAttribute)[0].join(": ");
                connection.setLabel(label);
            }
        }
    }

    function drawRelation(relation) {
        var sourceElem = document.getElementById(relation.mrSource),
            targetElem = document.getElementById(relation.mrTarget);

        if(sourceElem && targetElem) {
            var connection = plumber.connect({
                scope: relation.mrOrigin,
                source: sourceElem,
                target: targetElem,
                overlays: [ "Arrow" ]
            });

            connection.bind('click', function(conn, e) {
                setUpDialog('formAttribute', relation, 'form-attr');
            });

            return connection;
        }
    }
};

Template.freeform.destroyed = function () {
    plumber.detachEveryConnection();
};


Template.freeform.helpers({
    entityWithAttributes: function() {
        var info = {
            attributes: getLatestRevision(this.mrAttribute),
            entity: getLatestRevision(this.mrEntity),
        };

        if(info.attributes && info.entity) {return info; }
    }
});

/**  Render entities - media, maps */
Template.entity.rendered = function () {
    var _self = this,
        outerWrapper = _self.$('.entity-outer'),
        innerWrapper = _self.$('.entity-inner'),
        connector = _self.$('.connector'); 

    Meteor.defer(function() {
        addToRenderedList(_self.data.entity.mrOrigin);
    });  

    // Attach plugins - draggable, resizable, jsPlumbs
    var target = plumber.makeTarget(outerWrapper);
    var source = plumber.makeSource(connector, {parent: 'parent'});

    innerWrapper.resizable({ 
        ghost: true,
        handles: "all",
        stop: updateEntityAttributes 
    });
    
    plumber.draggable(outerWrapper, { stop: updateEntityAttributes });

    target.bind('beforeDrop', addRelation);

    function updateEntityAttributes(e, ui) {
        var provAttributes = {
            mrEntity: _self.data.entity.mrOrigin,
            currentAttributeOrigin: _self.data.attributes.mrOrigin,
            mrAttribute: {
                width: innerWrapper.css('width'),
                height: innerWrapper.css('height'),
                top: outerWrapper.css('top'),
                left: outerWrapper.css('left')
            }
        };

        Meteor.call('entityReportAttributeRevision', provAttributes, function(error, result) {
            if(error) 
                return alert(error.reason);
        });
    }
};

Template.entity.helpers({
    entityType: function () {
        return getEntityType(this.entity);
    },
    entityAttributes: function(type) {
        if(!this.attributes || _.isEmpty(this.attributes.mrAttribute)) {
            return;
        }
        // Publish message to notify change in entity attirbute
        $('#board').trigger('entityAttributeChange');

        var keys = ['width', 'height'],
            outerOffset = { width: 10, height: 55 };        
        if(type === 'outer') { keys = keys.concat(['top', 'left', 'z-index']); }

        // Convert key/vals to styles 
        var attrs = _.map(_.pick(this.attributes.mrAttribute, keys), function(value, key) {
            if(type === 'outer' && outerOffset[key] !== undefined) {
                value = parseInt(value, 10) + outerOffset[key] + 'px';
            }

            var attr = key +":"+ value +';';
            return attr;
        });

        return attrs.join(' ');
    }
});

Template.entity.events({
    'click .entity-info': function (e,tpl) {
        e.preventDefault();
        setUpDialog('entityInfo', _.extend(this.entity, {showRelations: false}));
    }
});


/**
 * Maps & Markers
 */
Template.map.rendered = function () {
    var _self = this,
        containerSelector = _self.data.mrOrigin +'-map',
        map, tileLayer;

    L.Icon.Default.imagePath = '../packages/leaflet/images';

    // set up the map
    map = L.map(containerSelector, {
        center: [20.0, 5.0],
        minZoom: 1, zoom: 2,
        doubleClickZoom: false
    });

    // Add the tile layer
    tileLayer = L.tileLayer('http://{s}.mqcdn.com/tiles/1.0.0/map/{z}/{x}/{y}.jpeg', {
        attribution: 'Tiles Courtesy of <a href="http://www.mapquest.com/">MapQuest</a> &mdash; Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>'+
         ' | '+ 'Nominatim Search Courtesy of <a href="http://www.mapquest.com/" target="_blank">MapQuest</a> <img src="http://developer.mapquest.com/content/osm/mq_logo.png">',
        subdomains: ['otile1','otile2','otile3','otile4']
    }).addTo(map);

    // Add a search layer
    map.addControl(new L.Control.Search({
        url: 'http://nominatim.openstreetmap.org/search?format=json&q={s}',
        jsonpParam: 'json_callback',
        propertyName: 'display_name',
        propertyLoc: ['lat','lon']
    }));

    // bind events to map
    map.on({ dblclick: function(info) { insertMarker(info.latlng); } });


    /**
     * MARKERS
     */
    var mapMarkerOrigins = _self.data.mrOrigin;
    Deps.autorun(function () {
        // Keep track of markers within the map (additions/removals) 
        mapMarkerOrigins = getLatestRevision(_self.data.mrOrigin).provHadMember || [];
    });

    markersQuery = Provenance.find({provType: 'MR: Marker', wasInvalidatedBy: { $exists: false} });
    markersQuery.observe({
        added: processMarker,
        changed: processMarker,
    });

    function processMarker(doc) {
        // if origin id is not present, return
        // if the marker is not a member of the map, return 
        if(doc.mrOrigin === undefined || !_.contains(mapMarkerOrigins, doc.mrOrigin)) { 
            return; 
        }

        // Update or insert marker
        var marker, popup;
        if(markers[doc.mrOrigin] !== undefined) {
            marker = markers[doc.mrOrigin];
            popup = marker.getPopup();
        } else {
            marker = L.marker(_.flatten(doc.mrLatLng)).addTo(map);
            // keep the marker for updating later
            markers[doc.mrOrigin] = marker;

            popup = L.popup({
                keepInView: true,
                autoPan: false,
                className: 'marker-popup'
            });
            // bind popup to marker
            marker.bindPopup(popup);

            addToRenderedList(doc.mrOrigin);
        }

        // Prepare marker popup
        var popupContent = document.createElement('div');
        UI.insert(UI.renderWithData(Template.entityInfo, doc), popupContent);
        popup.setContent(popupContent);

    }


    // Insert marker function
    function insertMarker(latlng) {
        provAttributes = {
            currentMapOrigin: _self.data.mrOrigin,
            mrLatLng: {
                lat: latlng.lat,
                lng: latlng.lng
            }
        };
        Meteor.call('addMapMarker', provAttributes, function (error, result) {
            if(error) 
                return alert(error.reason);
        });
    }

};

/**
 * Marker Popup
 */
Template.entityInfo.rendered = function () {
    var _self = this,
        relationElem = _self.$('.add-relation');
    
    // make relation endpoint
    if(relationElem.length > 0) {
        relationElem.attr({ "data-id": _self.data.mrOrigin });
        plumber.makeSource(relationElem, {parent: relationElem});
    }
};

Template.entityInfo.helpers({
    latestVersion: function() {
        var latest = getLatestRevision(this.mrOrigin);
        return _.extend(latest, _.pick(this, 'showRelations'));
    },
    showRelations: function() {
        var output = (this.showRelations !== undefined) ? this.showRelations : true;
        return output;
    },
});

Template.entityInfo.events({
    'click .add-atrribute': function(e, tpl) {
        setUpDialog('formAttribute', this, 'form-attr');
        
    }
});

/**
 * Shared Templates
 */
Template.displayAttributes.helpers({
    attributes: function() {
        if(!_.isEmpty(this.mrAttribute)) {
            var output = _.map(this.mrAttribute, function(value, label) {
                return {label: label, value: value};
            });
            return output;
        }
    },
});

Template.displayAttributes.events({
    'click .remove-attribute': function (e,tpl) {
        e.preventDefault();
        var attrKey = this.label;

        var provAttributes = {
            currentEntityOrigin: tpl.data.mrOrigin,
            attrKey: attrKey
        };

        Meteor.call('entityAttributeRemove', provAttributes, function (error, result) {
            if(error)
                return alert(error.reason);
        });
    }
});

Template.displayRelations.helpers({
    relations: function(key) {
        if(this.mrOrigin) {
            var list = getEntityRelative(this.mrOrigin);
            if(list && list[key]) {
                var relationOrigins = _.flatten(list[key]);
                return Provenance.find(
                    {mrOrigin: {$in: relationOrigins}, provType: 'MR: Relation', wasInvalidatedBy: {$exists: false}}
                );
            }

        }   
    },
    getEntity: function(item) {
        return getLatestRevision(item);
    }
});

Template.displayRelations.events({
    'mouseover .relative-entity-item': function (e,tpl) {
        var _self = this,
            endpointClassname = 'endpoint-marker',
            relativeClassName = 'highlight-entity',
            sourceElem = document.createElement('div'),
            targetElem = document.getElementById(_self.mrTarget),
            offset = getOffsetRect(e.currentTarget);

        $(sourceElem)
            .attr('id', _self.mrSource)
            .offset({
                top: offset.top, 
                left: offset.left + e.target.getBoundingClientRect().width,
            })
            .appendTo($(e.target));

        if(targetElem) {
            $(targetElem).addClass(relativeClassName);

            plumber.connect({
                scope: _self.mrOrigin,
                source: sourceElem,
                target: targetElem
            });
        }
    },
    'mouseout .relative-entity-item': function(e, tpl) {
        var _self = this,
            relativeClassName = 'highlight-entity',
            sourceElem = document.getElementById(_self.mrSource),
            targetElem = document.getElementById(_self.mrTarget),
            connection = plumber.getConnections(_self.mrOrigin)[0];

        $(sourceElem).remove();

        if(connection) {
            plumber.detach(connection);
        }

        if(targetElem) { 
            $(targetElem).removeClass(relativeClassName);
        }

    }

});

Template.displayThumbnail.helpers({
    isEntityType: function(type) {
        return (getEntityType(this) === type);
    },
});

/**
 * Forms
 */

Template.formAttribute.helpers({
    label: function () {
        if(this && !_.isEmpty(this.mrAttribute)) {
            return _.keys(this.mrAttribute)[_.toArray(this.mrAttribute).length - 1];
        } 
        return "Label";
    },
    value: function () {
        if(this && !_.isEmpty(this.mrAttribute)) {
            return _.values(this.mrAttribute)[_.toArray(this.mrAttribute).length - 1];
        } 
        return "Value";
    }
});

Template.formAttribute.events({
    'submit form': function (e, tpl) {
        e.preventDefault();
        var label = tpl.$('input[name=attribute-label]').val(),
            value = tpl.$('input[name=attribute-value]').val();

        var provAttributes = {
            currentEntityOrigin: this.mrOrigin,
            attributeKey: label.toLowerCase(),
            attributeValue: value
        };

        // Indicate whether or not the entity can accept multiple attributes
        var singleAttributeEntities = ['relation'],
            entityType = getEntityType(this);
        
        provAttributes.multipleAttributes = (_.contains(singleAttributeEntities, entityType)) ? false : true;

        Meteor.call('entityRevisionAttribute', provAttributes, function (error, result) {
            if(error)
                return alert(error.reason);
        });
    }
});


/**  Tools */
Template.tools.events({
    'submit form[name=media]': function (e, tpl) {
        e.preventDefault();
        var mediaUrl = $(e.target).find('input[name=mediaUrl]').val(),
                mediaFormat = $(e.target).find('select[name=mediaFormat]').val();

        // Insert appropriate provenances for the entity and the activity: revision, entity, membership
        var provAttributes = {
            currentCrisisId: this._id,
            currentCrisisOrigin: this.mrOrigin,
            provAtLocation: mediaUrl,
            dctermsTitle: this.dctermsTitle,
            dctermsDescription: this.dctermsDescription,
            dctermsFormat: mediaFormat // Mime type
        };

        Meteor.call('crisisReportMedia', provAttributes, function(error, id) {
            if (error)
                return alert(error.reason);
        });
    }, 
    'click .entity-map': function(e, tpl) {
        e.preventDefault();

        var provAttributes = {
            currentCrisisId: this._id,
            currentCrisisOrigin: this.mrOrigin,
            dctermsTitle: this.dctermsTitle,
            dctermsDescription: this.dctermsDescription
        };

        Meteor.call('crisisReportMap', provAttributes, function (error, result) {
            if(error)
                return alert(error.reason);
        });

    }
});



/**
 * HELPERS/ COMMON METHODS 
 */
function getEntityType(entity) {
    if(entity) {
        var type = entity.mrCollectionType || entity.provType.replace('MR: ', '');
        if(type) { return type.toLowerCase(); }
    }
}

function setUpDialog(template, entity, selectorSuffix) {
    var dialog,
        appendToElem = $('#board'),
        suffix = selectorSuffix || 'dialog',
        selector = entity.mrOrigin +'-'+ suffix,
        existingElem = document.getElementById(selector);

    // Add focus to the existing dialog
    if(existingElem) {
        dialog = $(existingElem).closest('.ui-dialog')[0];
        $(dialog).effect('shake', {distance: 4, times: 2});

        return;
    } 

    // Create a new dialog with attribute form if doesnt exist already
    dialog = document.createElement('div');
    UI.insert( UI.renderWithData(Template[template], entity), dialog);

    $(dialog)
        .attr('id', selector)
        .appendTo(appendToElem);

    $(dialog).dialog({
        autoOpen: true,
        close: function(e, ui) {
            $(this).remove();
        }
    });
}

function addToRenderedList(entity) {
    var renderedList = Session.get('renderedEntities');
    renderedList.push(entity);
    Session.set('renderedEntities', renderedList);
}

function addRelation(info) {
    var provAttributes = {
        // Gather source id, in case of markers look to the "data-id" attribute
        source: $(info.source).attr('data-id') || info.sourceId,
        target: info.targetId
    };
    Meteor.call('entityRelation', provAttributes, function (error, result) {
        if(error)
            return alert(error.reason);
    });
}

function getOffsetRect(elem) {
    // Solution from http://javascript.info/tutorial/coordinates
    // (1)
    var box = elem.getBoundingClientRect();
    
    var body = document.body;
    var docElem = document.documentElement;
    
    // (2)
    var scrollTop = window.pageYOffset || docElem.scrollTop || body.scrollTop;
    var scrollLeft = window.pageXOffset || docElem.scrollLeft || body.scrollLeft;
    
    // (3)
    var clientTop = docElem.clientTop || body.clientTop || 0;
    var clientLeft = docElem.clientLeft || body.clientLeft || 0;
    
    // (4)
    var top  = box.top +  scrollTop - clientTop;
    var left = box.left + scrollLeft - clientLeft;
    
    return { top: Math.round(top), left: Math.round(left) };
}
