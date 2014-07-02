Template.stage.rendered = function () {
	$("#stage div").draggable({ stack: '#stage div' });
	$(".resizable").resizable();
};

Template.entities.events({
	'submit form[name=media]': function (e, tpl) {
		e.preventDefault();
		var imageUrl = $(e.target).find('input[name=imageUrl]').val();

		// Further optimisation can be done by using javascript instead of jquery
		$('#stage').append(
			$('<div>', {
				class: 'draggable',
				html: $('<img>', {class:'resizable', src: imageUrl})
			})
		);


		var media = {
			currentCrisisId: this._id,
			mrMediaUrl: imageUrl,
			dctermsFormat: 'image/jpeg' // Mime type
		}

		// Meteor.call('newMedia', media, function(error, id) {
	 //    if (error)
  //       return alert(error.reason);    
	 //  });

	console.log("media", media);




	}
});