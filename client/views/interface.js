var attachHandlers = function(a, b) {
	$(a).resizable();
	$(b).draggable({ stack: '#stage div' });
}

Template.stage.rendered = function () {
	attachHandlers('.resizable', '#stage div');
};

Template.entities.events({
	'submit form[name=media]': function (e, tpl) {
		e.preventDefault();
		var mediaUrl = $(e.target).find('input[name=mediaUrl]').val(),
				mediaFormat = $(e.target).find('select[name=mediaFormat]').val() ;

		// Insert the new element to the stage //////////////////////////////////
		var wrapper = document.createElement('div'),
				//TODO: decide which element to create based on media type
				mediaElem = document.createElement('img'); 

		$('#stage').append(
			$(wrapper)
				.attr('class', 'draggable')
				.html($(mediaElem).attr('src', mediaUrl))
		);
		attachHandlers(mediaElem, wrapper);

		// Insert appropriate provenances for the entity and the activity: revision, entity, membership
		var provAttributes = {
			currentCrisisId: this._id,
			dctermsTitle: this.dctermsTitle,
			dctermsDescription: this.dctermsDescription,
			mrMediaUrl: mediaUrl,
			dctermsFormat: mediaFormat // Mime type
		}

		Meteor.call('crisisReportMedia', provAttributes, function(error, id) {
	    if (error)
        return alert(error.reason);  
	  });

	}
});