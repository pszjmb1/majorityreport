var plumber; 

Template.freeform.created = function () {
    Session.set('relations', [])
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

Template.freeform.helpers({
    allMediaRendered: function() {
        if(this.provHadMember) {   
            return (this.provHadMember.length === (Session.get('renderedMediaItems')).length)
        }
    },
    mediumWithAttribute: function() {
        return {
            attributes: getLatestRevision(this.mrAttribute),
            medium: getLatestRevision(this.mrMedia),
        }
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
    connect: function() {
        var _self = this;
        var sourceElem = document.getElementById(_self.mrSource),
            targetElem = document.getElementById(_self.mrTarget),
            annotationObj = _.first( _.map(_self.mrAnnotation, function(value, key) {
                    return {key: key, value: value};
                }) 
            ),
            annotation = annotationObj.key +": "+ annotationObj.value;

        // Make sure that a relationship entity only gets drawn once
        if(plumber.getConnections({scope: _self.mrOrigin}).length == 0 && (sourceElem && targetElem)) {
            var connection = plumber.connect({
                scope: _self.mrOrigin,
                source: sourceElem,
                target: targetElem,
                overlays: [
                    "Arrow",
                    ["Label", {label: annotation, cssClass: "connection-annotation"}]
                ]
            });

            // Ensure the ability to annotate a relationship
            connection.bind('click', function(conn, evt) {
                var dialog = $('.form-annotate'),
                    label = dialog.find('input[name=annotation-label]'),
                    value = dialog.find('input[name=annotation-value]');

                label.val(annotationObj.key);
                value.val(annotationObj.value);

                dialog.dialog("open");
            });
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
    })

    resizer.resizable({
        ghost: true,
        handles: "all",
        start: function(){ $(this).addClass('resizing-active'); },
        stop: function(){ 
            var parentDimensionOffset = {
                width: 10,
                height: 40
            }
            $(this).removeClass('resizing-active');
            updateMediaProperties();
        },
    });

    target.bind('beforeDrop', function(info) {
        addRelation(info)
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
            target: info.targetId,
            key: 'KEY'.toLowerCase(),
            message: 'Hello'
        };

        var connection = plumber.connect({
            source: info.sourceId,
            target: info.targetId,
        });

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
        plumber.repaintEverything();

        var wrapperOffset = { width: 0, height: 55 },
            keys = ['top', 'left', 'z-index', 'width', 'height'];
        
        // Return width and height styles for item, otherwise the positional styles
        if(itemScope === 'item') { keys = ['width', 'height']; }

        return _.map(_(this.attributes.mrAttribute).pick(keys), function(value, index){ 
                if(itemScope === 'wrapper' && wrapperOffset[index] != undefined)
                    value = parseInt(value, 10) + wrapperOffset[index] + "px";

                var prop = index +":"+ value; 
                return prop;
            }).join(';');
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

Template.relationAnnotate.rendered = function () {
    var _self = this;
    var dialog = _self.$('.form-annotate').dialog({ autoOpen: false });
};

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

        var reportId = this.mrOrigin;
        Meteor.call('crisisReportMedia', provAttributes, function(error, id) {
            if (error)
                return alert(error.reason);

            Router.go('crisisContainer', {_id: reportId});
        });
    }
});