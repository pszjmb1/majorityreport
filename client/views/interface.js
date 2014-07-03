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

		// Add the new element to the stage
		// Make sure to attach the handlers
		var wrapper = document.createElement('div'),
				//TODO: decide which element to create based on media type
				mediaElem = document.createElement('img'); 

		$('#stage').append(
			$(wrapper)
				.attr('class', 'draggable')
				.html($(mediaElem).attr('src', mediaUrl))
		);
		attachHandlers(mediaElem, wrapper);

		// Add appropriate provenance for the entity and the activity
		var media = {
			currentCrisisId: this._id,
			mrMediaUrl: mediaUrl,
			dctermsFormat: mediaFormat // Mime type
		}

		console.log(media);

		// Meteor.call('newMedia', media, function(error, id) {
	 //    if (error)
  //       return alert(error.reason);    
	 //  });

	}
});