/**
 * Implements the freeform interface with relations between media
 * 
 * Templates:
 * [1]: freeform
 * - delegates media rendering to the "media" template
 * - maintains relationships related to the current media using Session vars 
 * - handles drawing of the relations between media items
 * - the ability to annotate relations, wraps the annotation form in a *dialog*
 * [2]: formRelationAnnotate
 * - simply renders the fields required for adding/changin a relation annotation
 * - activated/initialised/called as a dialog from the 'freeform' template
 * - deals with db operations (adding/updating) relating to annotations
 * [3]: entities
 * - simply presents options to add different kinds of media
 * - handles corresponding operations for inserting an item within a report
 * [4]: media 
 * [5]: meta - displays media attributes and allows insertion/deletion/update
 * [6]: formAttribute - corresponds to the meta template
 * [7]: attributeItem - corresponds to the meta template
 * [8]: entityMap - Renders map and binds related operations
 *
 * Makes use of jQuery UI and jsPlumb 
 * - Always maintains a single instace of jsPlumb
 * - each relation is given its own scope in regards to jsPlumb
 */

var plumber, maps = {}, markers = {};

Template.freeform.created = function () {
    Session.set('relations', []);
    Session.set('renderedEntityItems', []);

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
    

    // Prepare the modal form for annotating relations
    var dialog = _self.$('.form-annotate');
    dialog.dialog({ 
        autoOpen: false,
        open: function(e) {
            var relationOrigin = dialog.find('input[name=annotation-relation-id]').attr('data-relation'),
                relation = getLatestRevision(relationOrigin);

            //  If annotation exists, prepopulate the modal form with existing values
            if(relation.mrAnnotation && !_.isEmpty(relation.mrAnnotation)) {
                var fieldLabel = dialog.find('input[name=annotation-label]'),
                    fieldValue = dialog.find('input[name=annotation-value]'),
                    annotation = _.pairs(relation.mrAnnotation)[0];
                fieldLabel.val(annotation[0]);
                fieldValue.val(annotation[1]);
            }
        }
    });


    // Selectable 
    board.selectable({filter: '.wrapper-medium'});

    // Listen to changes in child elements 
    board.bind('entity-changed', function() {
        // Redraw relations/connections on every resizing or dragging
        plumber.repaintEverything();

        // Calculate parent wrapper's dimension and position in relation to children nodes (absolute positioned)
        // based on solution from: http://stackoverflow.com/a/24922818
        // -- (http://jsfiddle.net/genkilabs/WCw8E/2/)
        var offset = { width: 40, height: 40},
            dimension = {
                width: $(window).width() - board.position().left - offset.width,
                height: $(window).height() - board.position().top - offset.height
            };

        board.find('.ui-draggable').each(function(){
            var itemDimen = {
                width: $(this).width() + $(this).position().left - board.position().left + offset.width,
                height: $(this).height() + $(this).position().top - board.position().top + offset.height,
            };

            if(dimension.width < itemDimen.width) { dimension.width = itemDimen.width; }
            if(dimension.height < itemDimen.height) { dimension.height = itemDimen.height; }
        });

        if(board.width() != dimension.width) { board.width(dimension.width); }
        if(board.height() != dimension.height) { board.height(dimension.height); }
    });    
    
};

Template.freeform.destroyed = function () {
    plumber.detachEveryConnection();
};


Template.freeform.helpers({
    allEntitiesRendered: function() {
        if(this.provHadMember) {   
            return (this.provHadMember.length === (Session.get('renderedEntityItems')).length);
        }
    },
    entityWithAttribute: function() {
        return {
            attributes: getLatestRevision(this.mrAttribute),
            entity: getLatestRevision(this.mrEntity),
        };
    },
    renderedEntities: function() {
        return Session.get('renderedEntityItems');
    },
    entityRelative: function(entity) {
        return getEntityRelative(entity);  
    }, 
    maintainRelations: function() {
        // Get the relevant targets and sources for the current media
        // and combine them into one single array
        // Once the array is ready accumulate only the unique relations that are present accross different media
        var sourceAndTarget = _.flatten(_.extend(this.mrSource, this.mrTarget)),
            relations = Session.get('relations'),
            newRels = _.union(relations, sourceAndTarget);

        Session.set('relations', newRels);
    },
    relations: function() {
        return Session.get('relations');
    },
    relationDetails: function() {
        return getLatestRevision(this.valueOf());
    },
    isConnected: function() {
        return (plumber.select({scope: this.mrOrigin}).length > 0);
    },
    annotation: function() {
        if(this.mrAnnotation && !_.isEmpty(this.mrAnnotation) ) {
            var annotation = _.pairs(this.mrAnnotation)[0];
            return annotation[0] +": "+ annotation[1];
        }
    },
    drawConnection: function(annotation) {
        var _self = this;
        var sourceElem = document.getElementById(_self.mrSource),
            targetElem = document.getElementById(_self.mrTarget);

        // Draw a new connection only if it hasn't been drawn before
        if(sourceElem && targetElem) {
            var connection = plumber.connect({
                scope: _self.mrOrigin,
                source: sourceElem,
                target: targetElem,
                overlays: [
                    "Arrow",
                    ["Label", {cssClass: "connection-annotation"}]
                ]
            });

            // Set the annotation if it exists
            if(annotation) { connection.setLabel(annotation); }

            // Ensure the ability to annotate a relationship
            connection.bind('click', function(conn, evt) {
                var dialog = $('.form-annotate'),
                    fieldLabel = dialog.find('input[name=annotation-label]'),
                    fieldValue = dialog.find('input[name=annotation-value]'),
                    fieldRelation = dialog.find('input[name=annotation-relation-id]');

                // Pass the relation reference to the form 
                //   for the purpose of updating the apporirate relation.
                fieldRelation.attr('data-relation', _self.mrOrigin);
                dialog.dialog("open");
            });
        }
    },
    updateConnection: function(annotation) {
        if(annotation) {
            plumber.select({scope: this.mrOrigin}).setLabel(annotation);
        }
    }

});

Template.entity.rendered = function() {
    // Select the elements that are present only within this template instance
    var _self = this,
        dragger = _self.$('.draggable'),
        resizer = _self.$('.resizable'),
        wrapper = _self.$('.wrapper-medium'),
        connector = _self.$('.connector');

    Meteor.defer(function(){
        var renderedMedia = Session.get('renderedEntityItems');
        renderedMedia.push(_self.data.entity.mrOrigin);
        Session.set('renderedEntityItems', renderedMedia);
    });

    var target = plumber.makeTarget(wrapper);
    var source = plumber.makeSource(connector, {parent: wrapper});

    plumber.draggable(dragger, {
        // containment: 'parent',
        start: function(){ 
            $(this).addClass('dragging-active'); 
        },
        stop: function(){ 
            // Fire custom event to handle every change in entity styles
            $('#board').trigger('entity-changed');
            $(this).removeClass('dragging-active'); 
            updateMediaProperties();
        },
    });

    resizer.resizable({
        ghost: true,
        handles: "all",
        start: function(){ $(this).addClass('resizing-active'); },
        stop: function(){ 
            var parentDimensionOffset = {
                width: 10,
                height: 40
            };

            $(this).removeClass('resizing-active');
            updateMediaProperties();
        },
    });

    target.bind('beforeDrop', function(info) {
        addRelation(info);
    });

    function updateMediaProperties() {
        var provAttributes = {
            mrMedia: _self.data.entity.mrOrigin,
            currentAttributeId: _self.data.attributes._id,
            currentAttributeOrigin: _self.data.attributes.mrOrigin,
            mrAttribute: {
                width: resizer.css('width'),
                height: resizer.css('height'),
                top: dragger.css('top'),
                left: dragger.css('left')
            }
        };
        
        // Update the properties in the db and create a new revision for the changes
        Meteor.call('mediaReportAttributeRevision', provAttributes, function(error, id) {
            if (error)
                return alert(error.reason);
        });
    }

};

Template.entity.helpers({
    pickStyles: function(itemScope) {
        if(_.isEmpty(this.attributes.mrAttribute)) {
            return;
        }
        // Fire custom event to handle every change in entity styles
        $('#board').trigger('entity-changed');

        // Prepare and return appropriate styles
        var wrapperOffset = { width: 15, height: 60 },
            keys = ['top', 'left', 'z-index', 'width', 'height'];
        
        // Return width and height styles for item, otherwise the positional styles
        if(itemScope === 'item') { keys = ['width', 'height']; }

        return _.map(_(this.attributes.mrAttribute).pick(keys), function(value, index){ 
                if(itemScope === 'wrapper' && wrapperOffset[index] !== undefined) 
                    value = parseInt(value, 10) + wrapperOffset[index] + "px";

                var prop = index +":"+ value; 
                return prop;
            }).join(';');
    },
    entityOfType: function(type, isType) {
        return (type === isType);
    },
    entityType: function() {
        var entity = this.entity;
        if(entity.provType && entity.provType === 'MR: Media') {
            return 'image';
        } else if(entity.mrCollectionType) {
            return entity.mrCollectionType.toLowerCase();
        }
    }, 

});


Template.entityMap.rendered = function () {
    var _self = this,
        containerId = _self.data.mrOrigin + "-map",
        map, tileLayer, markersLayer;

    L.Icon.Default.imagePath = '../packages/leaflet/images';

    // setup default map
    map = L.map(containerId, {
        center: [20.0, 5.0],
        minZoom: 2,
        zoom: 2,
        doubleClickZoom: false
    });
    
    maps[containerId] = map;

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

    // bind events
    map.on({
        dblclick: function(info) { insertMarker(info.latlng); }
    });

    function insertMarker(latlng) {
        provAttributes = {
            currentMapId: _self.data._id,
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

Template.entityMap.helpers({
    compactInfo: function (context) {
        return _.extend(getLatestRevision(this.valueOf()), {mapOrigin: context.mrOrigin});
    }
});

Template.entityMarker.rendered = function () {
    var _self = this;

    Meteor.defer(function() {
        var mapContainer = _self.data.mapOrigin +"-map",
            map = maps[mapContainer],
            marker, popup;

        marker = L.marker(_.flatten(_self.data.mrLatLng)).addTo(map);
        // Keep tracker of the marker instance
        markers[_self.data.mrOrigin] = marker;

        // Prepare marker popup
        var popUpContent = document.createElement('div');
        UI.insert(UI.renderWithData(Template.markerPopup, _self.data), popUpContent);
        
        popup = L.popup({
            keepInView: true,
            autoPan: false,
            className: 'marker-popup'
        }).setContent(popUpContent);

        marker.bindPopup(popup);
        marker.on('mouseover', function(e) {
            this.openPopup();
        });

        // bind any events 
        $(marker._icon).on('load', function(e) {
            var elem = $(e.target),
                connector = document.createElement('div');

            $(elem).attr({ "data-id": _self.data.mrOrigin });
            var source = plumber.makeSource(elem, {parent: elem});
        });
    });
       

};

Template.entityMarker.helpers({
    isMarkerAlreadyRendered: function() {
        return _.has(markers, this.mrOrigin);
    },
    maintain: function () {
        var marker = markers[this.mrOrigin],
            popup = marker.getPopup();

        var popUpContent = document.createElement('div');
        UI.insert(UI.renderWithData(Template.markerPopup, this), popUpContent);
        popup.setContent(popUpContent).update();
    }
});

Template.markerPopup.helpers({
    relatives: function () {
        return getEntityRelative(this.mrOrigin);
    },
    relative: function() {
        console.log(this);
    },
    entities: function(entities) {
        return _.map(_.flatten(entities), function(relation) {
            return getLatestRevision(relation);
        });
    }
});

Template.markerPopup.events({
    'mouseover .relation-item-marker-target': function(e, tpl) {
        var _self = this,
            className = "highlight-relative",
            targetElem = document.getElementById(_self.mrTarget),
            sourceElem = document.createElement('div'),
            offset = getOffsetRect(e.target);

        $(sourceElem)
            .attr('id', _self.mrSource)
            .offset({
                top: offset.top, 
                left: offset.left + e.target.getBoundingClientRect().width,
            })
            .addClass('marker-relative-endpoint')
            .appendTo($(e.target));

        if(targetElem) {
            $(targetElem).addClass(className);
            
            var connection = plumber.connect({
                scope: _self.mrOrigin,
                source: sourceElem,
                target: targetElem,
                overlays: [
                    "Arrow",
                    ["Label", {cssClass: "connection-annotation"}]
                ]
            });
        }
    },
    'mouseout .relation-item-marker-target': function(e, tpl) {
        var className = "highlight-relative",
            relativeElem = document.getElementById(this.mrTarget),
            source = document.getElementById(this.mrSource),
            connection = plumber.getConnections(this.mrOrigin)[0];

        $(source).remove();
        
        if(connection) { 
            plumber.detach(connection, {
                forceDetach: true
            });
        }

        if(relativeElem) {
            $(relativeElem).removeClass(className);
        }
    },
    
});

Template.entityPanel.helpers({
    entityWithAttribute: function () {
        return {
            attributes: getLatestRevision(this.mrAttribute),
            entity: getLatestRevision(this.mrEntity),
        }; 
    }
});

Template.meta.rendered = function () {
    var _self = this;
    // Set up our dialog
    var dialog = _self.$('.medium-attributes').dialog({
        autoOpen: false,
        show: {effect: 'fade', duration: 200, ease: 'easeinQuint'},
        hide: {effect: 'fade', duration: 200, ease: 'easeOutQuint'}
    });

    // Set up the trigger for our dialog
    _self.$(".show-attributes").on("click", function(e) {
        e.preventDefault();
        dialog.dialog("open");
    });
};

Template.meta.helpers({
    title: function(){
        return _.result(this.mrAttribute, 'title');
    },
    isMarkerPopup: function() {
        return (this.provType === 'MR: Marker');
    },
    shortdesc: function(){
        return _.result(this.mrAttribute, 'shortdesc');
    },
    attributes: function () {
        return _(this.mrAttribute).map(function(val, key){
                return {key: key, value: val};
            });
    },
    detailsWithContext: function(entity) {
        return _(this).extend({ mrEntity : entity});
    }
});

Template.formAttribute.events({
    'submit form': function (e, tpl) {
        e.preventDefault();
        var attrKey = tpl.$('input[name=attrKey]').val(),
            attrValue = tpl.$('input[name=attrValue]').val();
            
        var provAttributes = {
            currentEntityId: this._id,
            currentEntityOrigin: this.mrOrigin,
            attrKey: attrKey.toLowerCase(),
            attrValue: attrValue
        };

        Meteor.call('entityAttribute', provAttributes, function (error, result) {
            if(error)
                return alert(error.reason);
        });
    }
});

Template.attributeItem.events({
    'click .remove-attribute': function (e, tpl) {
       e.preventDefault();
       var attrKey = this.key;

       var provAttributes = {
            currentEntityId: this.mrEntity._id,
            currentEntityOrigin: this.mrEntity.mrOrigin,
            attrKey: attrKey
        };

        Meteor.call('entityAttributeRemove', provAttributes, function (error, result) {
            if(error)
                return alert(error.reason);
        });
    }
});

Template.formRelationAnnotate.events({
    'click .btn': function (e, tpl) {
        e.preventDefault();
        
        var annotationKey = tpl.$('input[name=annotation-label]').val(),
            annotationValue = tpl.$('input[name=annotation-value]').val().toLowerCase(),
            relationId = tpl.$('input[name=annotation-relation-id]').attr('data-relation');

        var provAttributes = {
            currentRelationOrigin: relationId,
            annotationKey: annotationKey.toLowerCase(),
            annotationValue: annotationValue
        };

        Meteor.call('relationRevisionAnnotation', provAttributes, function (error, result) {
            if(error)
                return alert(error.reason);
        });
    }
});

Template.tools.rendered = function () {
    var _self = this,
        btnEntityGroup = _self.$('.entity-group');

    btnEntityGroup.attr('disabled', true);
    $(document).on('selectableselecting selectableunselecting', function(e, ui) {
        console.log("yo");
        if( $(".ui-selecting").length > 1 || $(".ui-selected").length > 1 ) {
            btnEntityGroup.attr('disabled', false);
        } else {
            btnEntityGroup.attr('disabled', true);
        }
    });
};

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
    },
    'click .entity-group': function(e, tpl) {
        e.preventDefault();


        var selectedItems = $('.ui-selected'),
            members = _.map(selectedItems, function(item) {
                var data = UI.getElementData(item);
                if(data) {
                    return {
                        mrEntity: data.entity.mrOrigin,
                        mrAttribute: data.attributes.mrOrigin
                    };
                }
            });

        var div = document.createElement('div');
        var panelBox = calculcatePanelBox('.ui-selected');

        var provAttributes = {
            currentCrisisId: this._id,
            currentCrisisOrigin: this.mrOrigin,
            dctermsTitle: this.dctermsTitle,
            dctermsDescription: this.dctermsDescription,
            mrAttribute: panelBox,
            provHadMember: members
        };

        console.log(panelBox);
        Meteor.call('crisisReportPanel', provAttributes, function(error, id) {
            if (error)
                return alert(error.reason);

            // Deselect the elements if success
            $('.ui-selectable .ui-selected').each(function() {
                $(this).removeClass(".ui-selected");
            });
        });




    }
});



/**
 * HELPERS/ COMMON METHODS 
 */

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


function calculcatePanelBox(itemSelector, padding) {
    padding = padding || { top: 10, right: 10, bottom: 10, left: 10 };
    
    var box = { right: 0, bottom: 0, top: -1, left: -1 };

    $(itemSelector).each(function() {
        var itemBox = {
            left:  $(this).position().left,
            top: $(this).position().top,
            right: $(this).position().left + $(this).outerWidth(),
            bottom: $(this).position().top + $(this).outerHeight(),
        };

        if(box.left < 0 || box.left > itemBox.left) { box.left = itemBox.left; }
        if(box.top < 0 || box.top > itemBox.top) { box.top = itemBox.top; }
        if(box.right < itemBox.right) { box.right = itemBox.right; }
        if(box.bottom < itemBox.bottom) { box.bottom = itemBox.bottom; }

    });

    box.width = (box.right - box.left + padding.bottom) + 'px';
    box.height = (box.bottom - box.top + padding.left) + 'px';
    box.left = (box.left - padding.left) + 'px';
    box.top = (box.top - padding.top) + 'px';


    return box;
}