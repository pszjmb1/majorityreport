Template.media.rendered = function() {
    // Select the elements that are present only within this template instance
    var _self = this,
        dragger = _self.$('.draggable'),
        resizer = _self.$('.resizable');

    resizer.resizable({
        ghost: true,
        handles: "all",
        start: function(){ $(this).addClass('resizing-active'); },
        stop: function(){ 
            $(this).removeClass('dragging-active'); 
            updateMediaProperties();
        },
    });

    dragger.draggable({
        start: function(){ $(this).addClass('dragging-active'); },
        stop: function(){ 
            $(this).removeClass('dragging-active'); 
            updateMediaProperties();
        },
    });

    function updateMediaProperties() {
        var provAttributes = {
                mrMedia: _self.data.mrMedia,
                currentAttributeId: _self.data._id,
                currentAttributeOrigin: _self.data.mrOrigin,
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

Template.media.helpers({
    typeImage: function () {
        // check if the media is image
        return true;
    },
    mediumWithAttribute: function() {
        return {
            attributes: getLatestRevision(this.mrAttribute),
            medium: getLatestRevision(this.mrMedia),
        }
    },
    pickStyles: function(itemScope) {
        // Return width and height styles for item, otherwise the positional styles
        var keys = (itemScope === 'item') ? ['width', 'height'] : ['top', 'left', 'z-index'];
        return _.map(_(this.attributes.mrAttribute).pick(keys), function(value, index){ 
                return index +":"+ value; 
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

        console.log("Hello", provAttributes)

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