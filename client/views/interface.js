Template.entities.events({
    'submit form[name=media]': function (e, tpl) {
        e.preventDefault();
        var mediaUrl = $(e.target).find('input[name=mediaUrl]').val(),
                mediaFormat = $(e.target).find('select[name=mediaFormat]').val();

        // Insert appropriate provenances for the entity and the activity: revision, entity, membership
        var provAttributes = {
            currentCrisisId: this._id,
            mediaUrl: mediaUrl,
            dctermsTitle: this.dctermsTitle,
            dctermsDescription: this.dctermsDescription,
            dctermsFormat: mediaFormat // Mime type
        };

        var reportId = this.mrOriginProv;
        Meteor.call('crisisReportMedia', provAttributes, function(error, id) {
            if (error)
                return alert(error.reason);

            Router.go('crisisContainer', {_id: reportId});
        });
    }
});

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
                mrMediaProperties: _self.data.mrMediaProperties,
                mrProperties: {
                    width: resizer.css('width'),
                    height: resizer.css('height'),
                    top: dragger.css('top'),
                    left: dragger.css('left')
                }
            };
        // Update the properties in the db and create a new revision for the changes
        Meteor.call('mediaPropertiesRevision', provAttributes, function(error, id) {
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
    mediumItem: function() {
        return getLatestRevision(this.mrMedia);
    },
    mediumProperties: function() {
        return getLatestRevision(this.mrMediaProperties);
    },
    assignStyles: function(properties, itemScope) {
        // Return width and height styles for item, otherwise the positional styles
        var keys = (itemScope === 'item') ? ['width', 'height'] : ['top', 'left', 'z-index']; 
        
        return _.map(_(properties.mrProperties).pick(keys), function(value, index){ 
                return index +":"+ value; 
            }).join(';');
    },
    mediumWithProperties: function(m, p) {
        return {
            medium: m,
            properties: p
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
    _self.$(".add-attribute").on("click", function() {
        dialog.dialog("open");
    });

    // Attach an event listener to our form. Due to jQuery UI, we cannot utitlise Meteor events
    dialog.find("form[name=form-attribute]").on("submit", function(e){
        e.preventDefault();
        addAttributes(this);
    });

    dialog.find(".remove-attribute").on("click", function(e) {
        e.preventDefault();
        removeAttribute($(this).parent());
    });

    // Method calls to add the attributes
    function addAttributes(context) {
        var attrKey = $(context).find('input[name=attrKey]').val(),
            attrValue = $(context).find('input[name=attrValue]').val();
            
        var provAttributes = {
            currentMediaProv: _self.data.mrOriginProv,
            attrKey: attrKey,
            attrValue: attrValue
        };

        Meteor.call('mediaRevision', provAttributes, function (error, result) {
            if(error)
                return alert(error.reason);
        });
    }

    // Method call to remove an attribute, gets the DOM object to work out which key to remove from the DB
    function removeAttribute(context) {
       
    }

};

Template.meta.helpers({
    title: function(){
        return _.result(this.mrAttributes, 'title');
    },
    shortdesc: function(){
        return _.result(this.mrAttributes, 'shortdesc');
    },
    attributes: function () {
        return _(_(this.mrAttributes).omit('title')).map(function(val, key){
                return {key: key, value: val};
            });
    },
    detailsWithContext: function(details, context) {
        return {
            details: details,
            context: context
        };
    }


});

Template.metaItem.events({
    'click .remove-attribute': function (e, tpl) {
       e.preventDefault();
       var attrKey = this.details.key;

       var provAttributes = {
            currentMediaProv: this.context.mrOriginProv,
            attrKey: attrKey
        };

        Meteor.call('mediaAttributeRemove', provAttributes, function (error, result) {
            if(error)
                return alert(error.reason);
        });
    }
});