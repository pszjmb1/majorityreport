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
 *
 * Makes use of jQuery UI and jsPlumb 
 * - Always maintains a single instace of jsPlumb
 * - each relation is given its own scope in regards to jsPlumb
 */

var plumber; 

Template.freeform.created = function () {
    Session.set('relations', []);
    Session.set('renderedMediaItems', []);

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
    var _self = this;
    

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
};

Template.freeform.helpers({
    allMediaRendered: function() {
        if(this.provHadMember) {   
            return (this.provHadMember.length === (Session.get('renderedMediaItems')).length);
        }
    },
    mediumWithAttribute: function() {
        return {
            attributes: getLatestRevision(this.mrAttribute),
            medium: getLatestRevision(this.mrMedia),
        };
    },
    renderedMedia: function() {
        return Session.get('renderedMediaItems');
    },
    mediaRelative: function(media) {
        return getMediaRelative(media);  
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

Template.media.rendered = function() {
    // Select the elements that are present only within this template instance
    var _self = this,
        dragger = _self.$('.draggable'),
        resizer = _self.$('.resizable'),
        wrapper = _self.$('.wrapper-medium'),
        connector = _self.$('.connector');

    Meteor.defer(function(){
        var renderedMedia = Session.get('renderedMediaItems');
        renderedMedia.push(_self.data.medium.mrOrigin);
        Session.set('renderedMediaItems', renderedMedia);
    });

    var target = plumber.makeTarget(wrapper);
    var source = plumber.makeSource(connector, {parent: wrapper});

    plumber.draggable(dragger, {
        start: function(){ $(this).addClass('dragging-active'); },
        stop: function(){ 
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
            mrMedia: _self.data.medium.mrOrigin,
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

    function addRelation(info) {
        var provAttributes = {
            source: info.sourceId,
            target: info.targetId
        };

        Meteor.call('mediaRelation', provAttributes, function (error, result) {
            if(error)
                return alert(error.reason);
        });
    }
};

Template.media.helpers({
    typeImage: function () {
        // check if the media is image
        return true;
    },
    pickStyles: function(itemScope) {
        if(_.isEmpty(this.attributes.mrAttribute)) {
            return;
        }

        // Redraw relations/connections on every resizing or dragging
        plumber.repaintEverything();

        var wrapperOffset = { width: 0, height: 55 },
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
    isMedia: function(type, isType) {
        return (type === isType);
    },
    mediaType: function() {
        var _m = this.medium;
        if(_m.provType && _m.provType === 'MR: Media') {
            return 'image';
        } else if(_m.mrCollectionType && _m.mrCollectionType === "Map") {
            return 'map';
        }
    }, 

});

Template.renderMap.rendered = function () {
    var _self = this,
        containerId = _self.data._id.concat("-map");

    var map = L.map(containerId, {
        center: [20.0, 5.0],
        minZoom: 2,
        zoom: 2
    });

    var tileLayer = L.tileLayer('http://{s}.mqcdn.com/tiles/1.0.0/map/{z}/{x}/{y}.jpeg', {
        attribution: 'Tiles Courtesy of <a href="http://www.mapquest.com/">MapQuest</a> &mdash; Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
        subdomains: ['otile1','otile2','otile3','otile4']
    }).addTo(map);
};

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
        // console.log(this)
        return _.result(this.mrAttribute, 'title');
    },
    shortdesc: function(){
        return _.result(this.mrAttribute, 'shortdesc');
    },
    attributes: function () {
        return _(this.mrAttribute).map(function(val, key){
                return {key: key, value: val};
            });
    },
    detailsWithContext: function(mediaProv) {
        return _(this).extend({ mrMedia : mediaProv});
    }
});

Template.formAttribute.events({
    'submit form': function (e, tpl) {
        e.preventDefault();
        var attrKey = tpl.$('input[name=attrKey]').val(),
            attrValue = tpl.$('input[name=attrValue]').val();
            
        var provAttributes = {
            currentMediaId: this._id,
            currentMediaOrigin: this.mrOrigin,
            attrKey: attrKey.toLowerCase(),
            attrValue: attrValue
        };

        Meteor.call('mediaRevision', provAttributes, function (error, result) {
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
            currentMediaId: this.mrMedia._id,
            currentMediaOrigin: this.mrMedia.mrOrigin,
            attrKey: attrKey
        };

        Meteor.call('mediaAttributeRemove', provAttributes, function (error, result) {
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

Template.entities.events({
    'submit form[name=media]': function (e, tpl) {
        e.preventDefault();
        var mediaUrl = $(e.target).find('input[name=mediaUrl]').val(),
                mediaFormat = $(e.target).find('select[name=mediaFormat]').val();

        // Insert appropriate provenances for the entity and the activity: revision, entity, membership
        var provAttributes = {
            currentCrisisId: this._id,
            currentCrisisOrigin: this.mrOrigin,
            mediaUrl: mediaUrl,
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