var boardSelector = '#board',
    plumber, maps = {}, markers = {},
    dateFormat = "ddd, Do MMM YYYY",
    dateWithTimeFormat = "ddd, Do MMM YYYY - HH:mm";

Template.freeform.created = function () {
    Session.set('renderedEntities', []);

    jsPlumb.ready(function() {
        plumber = jsPlumb.getInstance({
            Anchor: 'Continuous',
            Connector:[ "Bezier", { curviness: 50 } ],
            DragOptions : { cursor: "crosshair" },
            PaintStyle : {
                lineWidth: 5,
                strokeStyle: '#77a',
                // gradient:{stops:[[0,'#656'], [0.5, '#77a']]},
            },
            EndpointStyles : [{ fillStyle:"#77a" }, { fillStyle:"#77a" }],
            Endpoint:[ "Dot", { radius: 10 } ], 
            Overlays: [
                ['Arrow', {width: 15, height: 5}]
            ]
        });
    }); 
};

Template.freeform.rendered = function () {
    var _self = this,
        board = this.$(boardSelector);

    board.selectable({ filter: '.entity-outer' });

    board.bind('entityAttributeChange', function(event, entityOrigin) {
        plumber.repaintEverything();
    });

    // draw connections/relations
    var relationsQuery = Provenance.find({ 
        provType: 'MR: Relation', 
        wasInvalidatedBy: { $exists: false} 
    });

    relationsQuery.observe({
        added: processRelation,
        changed: processRelation,
        removed: processRelation,
    });

    function processRelation(doc) {
        if(doc.mrOrigin === undefined) { return; }

        Deps.autorun(function() {

            // run everytime rendered list has changed
            // - therefore, also process when an *entity* is removed from the report 
            // -- e.g. remove drawn relations attached to the removed entity
            var renderedEntities = Session.get('renderedEntities');

            // Return if source and target are not rendered
            // handle entity removal from report
            if(!_.contains(renderedEntities, doc.mrSource) 
                || !_.contains(renderedEntities, doc.mrTarget)) {


                var connection = plumber.getConnections(doc.mrOrigin)[0];
                if(connection) { plumber.detach(connection); }

                // return without doing anything else
                return;
            }

            // either get the exisiting connection instance 
            // - OR draw the newly added relation or 
            var connection = plumber.getConnections(doc.mrOrigin);
            if(connection.length > 0) {
                connection = connection[0];
            } else {
                connection = drawRelation(doc);
            }

            // add or update relation label
            if(connection) {
                if(!_.isEmpty(doc.mrAttribute)) {
                    var label = _.pairs(doc.mrAttribute)[0].join(": ");
                    connection.setLabel(label);
                }
            }
        });

    }

    function drawRelation(relation) {
        var sourceElem = document.getElementById(relation.mrSource),
            targetElem = document.getElementById(relation.mrTarget);

        if(sourceElem && targetElem) {
            var connection = plumber.connect({
                scope: relation.mrOrigin,
                source: sourceElem,
                target: targetElem,
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
    var source = plumber.makeSource(connector, {parent: outerWrapper});

    innerWrapper.resizable({ 
        ghost: true,
        handles: "all",
    });
    
    plumber.draggable(outerWrapper, { 
        cancel: '.entity-item-timeline',
    });

    // Bind the event when a new connection is drawn
    target.bind('beforeDrop', addRelation);
};

Template.entity.destroyed = function () {
    removeFromRenderedList(this.data.entity.mrOrigin);
};

Template.entity.helpers({
    entityType: function () {
        return getEntityType(this.entity);
    },
    title: function() {
        if(_.has(this.entity.mrAttribute, 'title')) {
            return this.entity.mrAttribute.title;
        }
    },
    entityAttributes: function(type) {
        if(!this.attributes || _.isEmpty(this.attributes.mrAttribute)) {
            return;
        }
        // Publish message to notify change in entity attirbute
        $(boardSelector).trigger('entityAttributeChange', this.entity.mrOrigin);

        var keys = ['width', 'height'],
            outerOffset = { width: 0, height: 50 };        
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
    'dragstop .entity-outer, resizestop .entity-inner': function(e, tpl) {
        var outerWrapper = tpl.$('.entity-outer'),
            innerWrapper = tpl.$('.entity-inner');

        var provAttributes = {
            mrEntity: this.entity.mrOrigin,
            currentAttributeOrigin: this.attributes.mrOrigin,
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
    },
    'click .entity-info': function (e,tpl) {
        e.preventDefault();
        setUpDialog('entityInfo', this.entity);
    },
    'click .entity-remove': function(e, tpl) {
        e.preventDefault();

        var _self = this;
        var message = 'Are you sure you want to remove '+ getEntityType(_self.entity) + ' from the report?'
        
        if(confirm(message)) {
            var provAttributes = {
                currentCrisisOrigin: Session.get('currentCrisisOrigin'),
                currentEntityOrigin: _self.entity.mrOrigin,
                currentAttributesOrigin: _self.attributes.mrOrigin,
                dctermsTitle: _self.dctermsTitle,
                dctermsDescription: _self.dctermsDescription
            };

            Meteor.call('crisisEntityRemove', provAttributes, function (error, result) {
                if(error)
                    return alert(error.reason);
            });
        }

    }
});

/**
 * Media items
 */
Template.media.helpers({
    isEntityType: function(checkType) {
        var type = getEntityType(this);
        if(type === 'media') {
            type = getMediaFormat(this.dctermsFormat);
        }
        return (type === checkType);
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
    $(boardSelector).bind('entityAttributeChange', function(event, entityOrigin) {
        if(entityOrigin === _self.data.mrOrigin) {
            L.Util.requestAnimFrame(map.invalidateSize, map, !1, map._container);
        }
    });

    /**
     * MARKERS
     */
    var mapMarkerOrigins = [];
    Deps.autorun(function () {
        // Keep track of markers within the map (additions/removals) 
        var latest = getLatestRevision(_self.data.mrOrigin);
        if(latest) { mapMarkerOrigins = latest.provHadMember; }
    });

    var markersQuery = Provenance.find({provType: 'MR: Marker', wasInvalidatedBy: { $exists: false} });
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

            // Add to the rendered list for subscriptions
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
        Meteor.call('crisisMapMarker', provAttributes, function (error, result) {
            if(error) 
                return alert(error.reason);
        });
    }
};

/**
 * Timeline
 */
Template.timeline.rendered = function () {
    var _self = this,
        containerSelector = _self.data.mrOrigin +'-timeline',
        container = document.getElementById(containerSelector),
        timelineData = new vis.DataSet([]),
        options, timeline;

    options = {
        height: '150px',
        orientation: 'top',
        showCurrentTime: true,
        editable: {
            add: true,
            updateTime: true,
            updateGroup: false,
            remove: false
        },
        zoomMin: 1000000,
        zoomMax: 1000000000000,
        onAdd: addEvent,
        onUpdate: viewEditEvent,
        onMove: updateEventDateTime,
        // onRemove: function(item, callback){},
    };
       
    timeline = new vis.Timeline(container, timelineData, options);

    // Bind events
    // Set timeline height on resize. Auto resize on width is already support by vis.js
    $(boardSelector).on('entityAttributeChange', function(event, entityOrigin) {
        var parentBox = container.parentNode.getBoundingClientRect();
        if($(container).height() !== parentBox.height) {
            timeline.setOptions({height: parentBox.height});
        }
    });

    /**
     * Timeline Events
     */
    var timelineEventOrigins = [];
    Deps.autorun(function () {
        // Keep track of markers within the timeline (additions/removals) 
        var latest = getLatestRevision(_self.data.mrOrigin);
        if(latest) { timelineEventOrigins = latest.provHadMember; }
    });

    var eventsQuery = Provenance.find({provType: 'MR: Event', wasInvalidatedBy: { $exists: false} });
    eventsQuery.observe({
        added: processEvents,
        changed: processEvents,
    });

    function processEvents(doc) {
        // if origin id is not present, return
        // if the event is not a member of the current timleine, return 
        if(doc.mrOrigin === undefined || !_.contains(timelineEventOrigins, doc.mrOrigin)) { 
            return; 
        }

        // Prepare data for timeline
        var eventEntity = { 
            id: doc.mrOrigin, 
            content: doc.dctermsTitle, 
            start: moment(doc.mrStartDate).toDate()
        };
        if(doc.mrEndDate) { eventEntity.end = moment(doc.mrEndDate).toDate(); }
        // Add or update the new data to the time line
        // DataSet object determines whether to add or update automatically.
        timelineData.update(eventEntity);  
        timeline.fit();

        // Make sure the enity is in the rendered list, to subscribe for data reliably
        addToRenderedList(doc.mrOrigin);
    }

    // Operations for adding a new timeline event
    function addEvent(info) {
        var dialog = setUpDialog('formEvent', _.extend(_self.data, info), 'form-event');
    }

    function viewEditEvent(info, callback) {
        if(info) {
            var dialog = setUpDialog('entityInfo', getLatestRevision(info.id));
        }
    }

    function updateEventDateTime(info) {
        var provAttributes = {
            currentEventOrigin: info.id,
            dctermsTitle: info.content,
            mrStartDate: moment(info.start).toDate()
        };

        if(info.end) { provAttributes.mrEndDate = moment(info.end).toDate(); }

        addUpdateTimelineEvent(provAttributes);
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
        return getLatestRevision(this.mrOrigin);
    },
    isEntityType: function(checkType) {
        var type = getEntityType(this);
        if(type === 'media') {
            type = getMediaFormat(this.dctermsFormat);
        }
        return (type === checkType);
    },
    showRelations: function() {
        var showRelationsFor = ['event', 'marker'],
            type = getEntityType(this);
        if(_.contains( showRelationsFor, type)) { return true; }

        return false;
    },
    entityInfoTemplate: function() {
        var type = getEntityType(this);
        if(type === 'media') {
            type = getMediaFormat(this.dctermsFormat);
        }

        type = type.capitalize();
        return "entity"+ type +"Info";
    },
    entityFormTemplate: function() {
        var type = getEntityType(this);
        if(type === 'media') {
            type = getMediaFormat(this.dctermsFormat);
        }

        type = type.capitalize();
        return "form"+ type;
    }
});

Template.entityInfo.events({
    'click .add-atrribute': function(e, tpl) {
        e.preventDefault();
        setUpDialog('formAttribute', this, 'form-attr');
    },
    'click .edit-entity': function(e, tpl) {
        e.preventDefault();
        tpl.$('.edit-entity-form').collapse('toggle');
    }
});

/**
 * Shared Templates
 */
Template.displayAttributes.rendered = function () {
    var _self = this;
    _self.$('.label-tooltip').tooltip({
        track: true,
        position: {
            my: "left top",
            at: "left top"
        },
    });

};
Template.displayAttributes.helpers({
    groupedAttributes: function() {
        var _self = this;
        var relatives = getEntityRelative(_self.mrOrigin);
        // Get entity relatives to get the "related attributes"
        if(relatives) {
            var entityOrigins = _.keys(_.extend(relatives.mrSource, relatives.mrTarget));

            // Find the attributes among the relatives
            var attributes = Provenance.find({
                    mrOrigin: {$in: entityOrigins}, provType: 'MR: Attribute', wasInvalidatedBy: {$exists: false}
                }).map(function(attrib) {
                    // Find the latest version of the relation, which contains the certainity info
                    var relation = Provenance.findOne(
                            {provType: 'MR: Relation', mrSource: _self.mrOrigin, mrTarget: attrib.mrOrigin, wasInvalidatedBy: {$exists: false}},
                            {sort: {provGeneratedAtTime: -1}}
                        );

                    // return attribute combined with the relation info
                    return _.extend(attrib, {
                            entityOrigin: _self.mrOrigin, mrCertainity: relation.mrAttribute.mrCertainity
                        });
                });
            // Group everything by attribute label
            var grouped = _.map(_.groupBy(attributes, 'mrLabel'), function(value, key) {
                return {mrLabel: key, values: value};
            });

            return grouped;
        }
    },
    certainityCount: function() {
        if(this.mrCertainity) { return this.mrCertainity.length; }
    },
    groupedCertainity: function() {
        if(this.mrCertainity) {
            var grouped = _.groupBy(this.mrCertainity, function(cer) {
                return cer.upAssertionConfidence;
            }); 

            var sorted = _.sortBy(grouped, function(value, key) {
                return key;
            });

            return sorted.reverse();
        }
    },
    confidence: function() {
        var obj = this;
        if(_.isArray(this)) { obj = this[0]; } 

        return _.pick(obj, 'upAssertionConfidence');
    },
    confidenceMin: function() {
        if(this.upAssertionConfidence.length == 2) {
            return this.upAssertionConfidence[0]
        } else { 
            return 0;
        }
    },
    confidenceRange: function() {
        if(this.upAssertionConfidence.length == 2) {
            return this.upAssertionConfidence[1] - this.upAssertionConfidence[0];
        } else { 
            return this.upAssertionConfidence[0];
        }
    },
    verifiedBy: function() {
        if(this.mrCertainity && this.mrCertainity.mrAssertionBy) {
            return this.mrCertainity.mrAssertionBy;
        }
    },
});

Template.displayAttributes.events({
    'click .add-attribute-value': function(e,tpl) {
        e.preventDefault();
        setUpDialog('formAttribute', this, 'form-attr');
    },
    'click .validate-attribute-value': function(e,tpl) {
        e.preventDefault();
        var provAttributes = {
            currentEntityOrigin: this.mrOrigin,
            label: this.label,
            mrValue: this.mrValue
        }

        Meteor.call('validateAssertion', provAttributes, function(error, result) {
            if(error)
                return alert(error.reason);
        });
    },
    'click .agree-attribute-value': function(e,tpl) {
        e.preventDefault();
        $(e.currentTarget).siblings('.agree-attribute-form').toggle('collapse');
    },
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
    isRendered: function(key) {
        return _.contains(Session.get('renderedEntities'), this[key]);
    },
    getEntity: function(item) {
        return getLatestRevision(item);
    }
});

Template.displayRelations.events({
    'mouseover .relative-entity-item': function (e,tpl) {
        var _self = this,
            ghostSelector = _self.mrSource +"-ghost-endpoint",
            endpointClassname = 'endpoint-marker',
            relativeClassName = 'highlight-entity',
            sourceElem = document.createElement('div'),
            targetElem = document.getElementById(_self.mrTarget),
            offset = getOffsetRect(e.currentTarget);

        $(sourceElem)
            .attr('id', ghostSelector)
            .offset({
                top: offset.top, 
                left: offset.left + e.target.getBoundingClientRect().width,
            })
            .appendTo($(e.target));

        if(targetElem) {
            $(targetElem).addClass(relativeClassName);
            plumber.connect({
                scope: ghostSelector,
                source: sourceElem,
                target: targetElem
            });
        }
    },
    'mouseout .relative-entity-item': function(e, tpl) {
        var _self = this,
            ghostSelector = _self.mrSource +"-ghost-endpoint",
            relativeClassName = 'highlight-entity',
            sourceElem = document.getElementById(ghostSelector),
            targetElem = document.getElementById(_self.mrTarget),
            connection = plumber.getConnections(ghostSelector)[0];

        $(sourceElem).remove();

        if(connection) {
            plumber.detach(connection);
        }

        if(targetElem) { 
            $(targetElem).removeClass(relativeClassName);
        }

    }
});

Template.entityEventInfo.events({
    'click .edit-event': function(e, tpl) {
        e.preventDefault();
        var dialog = setUpDialog('formEvent', this, 'form-event-edit');
    }
});

Template.displayThumbnail.helpers({
    isEntityType: function(checkType) {
        var type = getEntityType(this);
        if(type === 'media') {
            type = getMediaFormat(this.dctermsFormat);
        }
        return (type === checkType);
    },
});

/**
 * Forms
 */

Template.formAttribute.helpers({
});

Template.formAttribute.events({
    'submit form': function (e, tpl) {
        e.preventDefault();
        var label = tpl.$('input[name=attribute-label]').val(),
            value = tpl.$('input[name=attribute-value]').val(),
            certainity = tpl.$('.input-slider').slider('values'),
            reason = tpl.$('input[name=attribute-reason]').val();

        // sort value just to make sure
        certainity = _.sortBy(certainity, function(v) { return v; });
        
        // check to see if a similar label:value already exists for the entity
        var attributes = Provenance.find({
            provType: 'MR: Attribute',
            mrLabel: label.toLowerCase(),
            wasInvalidatedBy: {$exists: false}
        }).fetch();

        // ** perform a non-case-sensitive search
        var similarAttribute = _.find(attributes, function(attrib) {
            var matcher = new RegExp(value, 'i');
            return matcher.test(attrib.mrValue);
        });

        // -- confirm with user to update the attribute or cancel.
        if(similarAttribute) {
            // work with existing attribute, either update or cancel
            var msg = 'Similar value already exists for this entity.'
                +'\nExisting value: '+ similarAttribute.mrLabel +': '+ similarAttribute.mrValue
                +'\nYour input value: ' + label +': '+ value
                +'\n\n Press OK to update the existing value'

            var updateExistingAttribute = confirm(msg);

            if(!updateExistingAttribute) { return; }
            // update existing attribute value
            var provAttributes = {
                    currentAttributeOrigin: similarAttribute.mrOrigin,
                    mrLabel: label,
                    mrValue: value
                };
            Meteor.call('relatedAttributeUpdate', provAttributes, function (error, result) {
                if(error)
                    return alert(error.reason);
            });

            // update certainity record
            var provAttributes = {
                currentAttributeOrigin: similarAttribute.mrOrigin,
                currentEntityOrigin: this.mrOrigin,
                mrCertainity: {
                    upAssertionConfidence: certainity,
                    upAssertionType: 'upHumanAsserted',
                    mrAssertionReason: reason,
                }
            };
            Meteor.call('entityAttributeRelationAgree', provAttributes, function(error, result) {
                if(error)
                    return alert(error.reason);
            });
        } else {
            // new attribute
            var provAttributes = {
                currentEntityOrigin: this.mrOrigin,
                mrLabel: label,
                mrValue: value,
                mrCertainity: {
                    upAssertionConfidence: certainity,
                    upAssertionType: 'upHumanAsserted',
                    mrAssertionReason: reason,
                }
            };
            Meteor.call('entityAttributeRelationAdd', provAttributes, function (error, result) {
                if(error)
                    return alert(error.reason);
            });
            
        }
    }
});

Template.formAgreeAttribute.rendered = function () {
    var _self = this,
        fieldCertainity = $('input[name=attribute-certainity]'),
        inputSlider = _self.$('.input-slider'),
        initialRangeValues = [10, 30];

    inputSlider.slider({
        range: true,
        min: 0,
        max: 100,
        step: 0.01,
        values: initialRangeValues
    });

    Meteor.defer(function(){
        if(_self.data.data) {
            var _data = _self.data.data
            if(_data.mrCertainity && _data.mrCertainity.length > 0) {
                var userCertainity = getAttributeUserCertainity(_data);
                if(userCertainity && userCertainity.upAssertionConfidence) {
                    var confidence = userCertainity.upAssertionConfidence;
                    if(confidence.length === 1) {
                        confidence[1] = confidence[0];
                    }
                    inputSlider.slider('values', userCertainity.upAssertionConfidence);
                }
            }
        }
    });
};

Template.formAgreeAttribute.helpers({
    userCertainity: function () {
        var confidence = getAttributeUserCertainity(this.data);
        if(confidence) {
            return getAttributeUserCertainity(this.data);
        }
    }
});

Template.formAgreeAttribute.events({
    'change input[name=attribute-certainity]': function(e, tpl) {
        var fieldCertainity = $(e.target),
            inputSlider = tpl.$('.input-slider'),
            values = fieldCertainity.val(),
            matcher = /([^|to|%|-|\s])+(\d+(\.\d+)?){1,2}?/g;

        values = values.match(matcher).map(function(v) {
            return parseFloat(v).toFixed(2);
        });
        

        if(_.some(values, function(v){ return v > 100.00})) {
            alert('Error: certainity level should be within the range of 0 to 100%.');
            var sliderValues = getCertainityRangeDisplayValue(inputSlider);
            fieldCertainity.val(sliderValues);
        } else {
            values = _.sortBy(values, function(v) { return v; });
            if(values.length === 1) { values = [values, values]; }
            inputSlider.slider('values', values); 
        }
    },
    'slidecreate .input-slider, slide .input-slider, slidechange .input-slider': function(e, tpl, ui) {
        var inputSlider = tpl.$('.input-slider'),
            values = getCertainityRangeDisplayValue(inputSlider);

        tpl.$('input[name=attribute-certainity]').val(values);
    },
    'submit form[name=agree-attribute]': function(e,tpl) {
        e.preventDefault();
        var _self = this;

        var certainity = tpl.$('.input-slider').slider('values'),
            reason = tpl.$('input[name=attribute-reason]').val();

        // sort value just to make sure
        certainity = _.sortBy(certainity, function(v) { return v; });

        var provAttributes = {
            currentAttributeOrigin: _self.data.mrOrigin,
            currentEntityOrigin: _self.data.entityOrigin,
            mrCertainity: {
                upAssertionConfidence: certainity,
                upAssertionType: 'upHumanAsserted',
                mrAssertionReason: reason,
            }
        };
        Meteor.call('entityAttributeRelationAgree', provAttributes, function(error, result) {
            if(error)
                return alert(error.reason);

        });
    }
});

Template.formEvent.rendered = function () {
    var _self = this,
        startElem = _self.$('.start-date'),
        endElem = _self.$('.end-date'),
        initialStartDate = _self.data.start || _self.data.mrStartDate,
        initialEndDate = _self.data.end || _self.data.mrEndDate,
        options = { 
            format: dateWithTimeFormat,
            sideBySide: true,
        };
    
    startElem.datetimepicker(options);
    endElem.datetimepicker(options);

    if(initialStartDate) {
        endElem.data("DateTimePicker").setMinDate(initialStartDate);
    }
    if(initialEndDate) {
        startElem.data("DateTimePicker").setMaxDate(initialEndDate);
    }


    startElem.on("load, dp.change",function (e) {
       endElem.data("DateTimePicker").setMinDate(e.date);
    });

    endElem.on("dp.change",function (e) {
       startElem.data("DateTimePicker").setMaxDate(e.date);
    });
};

Template.formEvent.helpers({
    title: function () {
        if(this.dctermsTitle) { return this.dctermsTitle; }
    },
    startDate: function() {
        var date = this.start || this.mrStartDate;
        if(date) {
            return moment(date).format(dateWithTimeFormat);
        }
    },
    endDate: function() {
        var date = this.end || this.mrEndDate;
        if(date) {
            return moment(date).format(dateWithTimeFormat);
        }
    }
});

Template.formEvent.events({
    'submit form[name=event]': function(e, tpl) {
        e.preventDefault();
        
        var isUpdateOperation = false;
        if(this.provType === 'MR: Event') { isUpdateOperation = true; }

        // Gather values
        var title = tpl.$('input[name=event-title]').val(),
            fieldStartDate = tpl.$('input[name=event-start-date]').val(),
            fieldEndDate = tpl.$('input[name=event-end-date]').val(),
            startDate = tpl.$('.start-date').data("DateTimePicker").getDate(),
            endDate = tpl.$('.end-date').data("DateTimePicker").getDate();

        // TODO: Check/Valid inputs
        // Prepare information bundle for db operation
        var provAttributes = {
                dctermsTitle: title,
                mrStartDate: moment(startDate).toDate()
            },
            originField = (isUpdateOperation) ? 'currentEventOrigin' : 'currentTimelineOrigin';

        provAttributes[originField] = this.mrOrigin;
        if(fieldEndDate && endDate) { provAttributes.mrEndDate = moment(endDate).toDate(); }

        var result = addUpdateTimelineEvent(provAttributes);  

    }
});


/**  Tools */
Template.tools.rendered = function () {
    var _self = this,
        btnEntityGroup = _self.$('.entity-group');

    btnEntityGroup.attr('disabled', true);

    $(board).on('selectableselecting selectableunselecting', function(e, ui) {
        if( $(".ui-selecting").length > 1 || $(".ui-selected").length > 1 ) {
            btnEntityGroup.attr('disabled', false);
        } else {
            btnEntityGroup.attr('disabled', true);
        }
    });


    _self.$('.dropdown-menu textarea').on('click', function(e) {
        e.stopPropagation();
    });
};

Template.tools.events({
    'submit form[name=text]': function (e, tpl) {
        e.preventDefault();
        var textContent = tpl.$('textarea[name=textContent]').val();

        var provAttributes = {
            currentCrisisId: this._id,
            currentCrisisOrigin: this.mrOrigin,
            mrContent: textContent,
            dctermsTitle: this.dctermsTitle,
            dctermsDescription: this.dctermsDescription,
        };

        Meteor.call('crisisReportText', provAttributes, function(error, id) {
            if (error)
                return alert(error.reason);
        });

    },
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
    'click .entity-timeline': function(e, tpl) {
        e.preventDefault();

        var provAttributes = {
            currentCrisisId: this._id,
            currentCrisisOrigin: this.mrOrigin,
            dctermsTitle: this.dctermsTitle,
            dctermsDescription: this.dctermsDescription
        };

        Meteor.call('crisisReportTimeline', provAttributes, function (error, result) {
            if(error)
                return alert(error.reason);
        });
    }
});

/**
 * Shared DB Operation helpers
 */
function addRelation(info) {
    var provAttributes = {
        // Gather source id, in case of markers look to the "data-id" attribute
        mrSource: $(info.source).attr('data-id') || info.sourceId,
        mrTarget: info.targetId
    };
    Meteor.call('entityRelation', provAttributes, function (error, result) {
        if(error)
            return alert(error.reason);
    });
}

function addUpdateTimelineEvent(provAttributes) {
    var isUpdateOperation = false;
    if(_.has(provAttributes, 'currentEventOrigin')) { isUpdateOperation = true; }

    // Determine which method to call
    var method = (isUpdateOperation) ? 'crisisTimelineEventRevision' : 'crisisTimelineEvent';

    Meteor.call(method, provAttributes, function (error, result) {
        if(error) 
            return alert(error.reason);
    });
}

/**
 * HELPERS/ COMMON METHODS 
 */
function getCertainityRangeDisplayValue(inputSlider) {
    var values = inputSlider.slider('values');
    // Reduce the array if there is no range 
    // OR Sort the values 
    
    if(values[0] == values[1]) { 
        values.pop();
    } else {
        values = _.sortBy(values, function(v) { return v; });
    }

    return values.join('% - ') + "%";
}

function getAttributeUserCertainity(data) {
    if(!data) { return; }
    var userProv = Provenance.findOne({mrUserId: Meteor.userId()});
    if(userProv._id){
        var userCertainity = _.findWhere(data.mrCertainity, {mrAssertionBy: userProv._id});
        if(userCertainity){ return userCertainity; }
    }
}

function setUpDialog(template, entity, selectorSuffix) {
    var dialog,
        appendToElem = $(boardSelector),
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
        width: 450,
        close: function(e, ui) {
            $(this).remove();
        }
    });

    return dialog;
}

function addToRenderedList(entity) {
    var renderedList = Session.get('renderedEntities');
    if(!_.contains(renderedList, entity)) {
        renderedList.push(entity);
        Session.set('renderedEntities', renderedList);
    }
}

function removeFromRenderedList(entity) {
    var renderedList = Session.get('renderedEntities');
    if(_.contains(renderedList, entity)) {
        Session.set('renderedEntities', _.without(renderedList, entity));
    }
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