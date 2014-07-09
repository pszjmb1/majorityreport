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
	var self = this,
		dragger = self.$('.draggable'),
		resizer = self.$('.resizable');


	resizer.resizable({
		ghost: true,
		stop: updateMediaProperties,
		handles: "all",
		resize: function(event, ui){
	       reposition = ui.position;
	     }
	});

	dragger.draggable({
		stop: updateMediaProperties
	});

	function updateMediaProperties() {
		var provAttributes = {
				mrMedia: self.data.mrMedia,
				mrMediaProperties: self.data.mrMediaProperties,
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
	medium: function() {
		return Provenance.findOne(this.mrMedia);
	},
	properties: function() {
		return getLatestRevision(this.mrMediaProperties)
	},
	assignStyles: function(properties, itemScope) {
		var keys = (itemScope === 'item') ? ['width', 'height'] : ['top', 'left', 'z-index']; 
		
		return _.map(_(properties.mrProperties).pick(keys), function(value, index){ 
				return index +":"+ value; 
			}).join(';');
	},
	getValue: function(record, key) {
		return record[key];
	}
});

