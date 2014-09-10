/**
 * Mini map - jquery plugin
 * Based on the work by Nathaniel Taintor and Brian Wald for Janrain
 * (https://github.com/goldenapples/jquery.minimap)
 */

window.MiniMap = MiniMap;
function MiniMap() {
	this.containerId = 'board';
	this.miniMapWrapperId = 'mini-map-wrapper';
	this.miniMapWrapperInnerClass = 'mini-map-wrapper-inner';
	
	this.viewAreaClass = 'view-area';
	this.width = 200;
	this.height = 200;

	this.initialised = false;

	this.mapWrapper = this.mapWrapperInner = this.container = this.mapBox = this.viewArea = null;

	this.filterNodesBy = {
		tags: ['div'],
		classes: ['entity-outer', 'entity-inner'],
		attributes: ['style']
	};

	return this;
}

MiniMap.prototype.init = function() {
	if(this.initialised) return; 

	var self = this;
	self.initialised = true;

	self.container = document.getElementById(self.containerId);
	self.mapWrapper = document.getElementById(self.miniMapWrapperId);

	self.viewArea = document.createElement('div');
	self.viewArea.className = self.viewAreaClass;


	self.mapWrapper.style.width = self.width +'px';
	self.mapWrapper.style.height = self.height +'px';
	self.mapWrapper.appendChild(self.viewArea);

	self.mapWrapperInner = document.createElement('div');
	self.mapWrapperInner.className = self.miniMapWrapperInnerClass;
	self.mapWrapper.appendChild(self.mapWrapperInner);

	self.clickArea = document.createElement('div');
	self.clickArea.className = 'click-area';
	self.mapWrapper.appendChild(self.clickArea);
};



MiniMap.prototype.render = function(options) {
	this.init();
	var self = this;

	if(self.mapBox !== null && self.mapBox.parentNode === self.mapWrapperInner) { 
		self.mapWrapperInner.removeChild(self.mapBox); 
	}

	if(options && options.html) {
		self.mapBox.innerHTML = options.html;
	}
	self.mapWrapperInner.appendChild(self.mapBox);
};

MiniMap.prototype.drawMap = function() {
	this.init();

	var self = this,
		containerRect = self.container.getBoundingClientRect(),
		mapWrapperRect = self.mapWrapper.getBoundingClientRect();

	if(self.mapBox !== null && self.mapBox.parentNode === self.mapWrapperInner) { 
		self.mapWrapperInner.removeChild(self.mapBox); 
	}

	var mapPostion = {top: 0, left: 0};

	var $container = $(self.container);
	var containerOriginalStyles = $container.css(['transform', 'height', 'top', 'overflow']);
	// apply temp styles to get full dimension of the container, including overflown elements
	$container.css({
		transform: 'scale(1)',
		height: 0, top: 0, overflow: 'scroll'
	});
	var containerOverflowRect = { width: self.container.scrollWidth, height: self.container.scrollHeight }

	// restore origin container style
	$container.css(containerOriginalStyles);

	self.mapBox = self.container.cloneNode(true);

	var children = $(self.mapBox).find('[style*="top"]').map(function(index, value) {
		if(this.style.top) { 
			var topValue = parseFloat(this.style.top);
			mapPostion.top = (topValue < mapPostion.top ) ? topValue : mapPostion.top;
		}
		if(this.style.left) { 
			var leftValue = parseFloat(this.style.left);
			mapPostion.left = (leftValue < mapPostion.left ) ? leftValue : mapPostion.left;
		}
	});	
	
	var mapScale = Math.min(
			(mapWrapperRect.width / containerOverflowRect.width),
			(mapWrapperRect.height / containerOverflowRect.height)
		) - 0.02;

	self.mapBox.style.cssText = '';
	$(self.mapBox).css({
		width: 					containerOverflowRect.width +'px',
		height:					containerOverflowRect.height +'px',
		position:               'absolute',
      	top:                    Math.abs(mapPostion.top) * mapScale,
      	left:                   Math.abs(mapPostion.left) * mapScale,
		'transform': 			'scale('+mapScale+')',
		'transform-origin': 	'top left',
	});

	self.mapWrapperInner.appendChild(self.mapBox);

	$(self.clickArea).on('click', function(e) {
		var scale = Math.max(
				(containerRect.width / mapWrapperRect.width),
				(containerRect.height / mapWrapperRect.height)
			);
		var position = {
				top: e.offsetY * scale,
				left: e.offsetX * scale,
			};

		position.top = (mapPostion.top < 0) ? (position.top + mapPostion.top) - (containerRect.height/2) : position.top;
		position.left = (mapPostion.left < 0) ? (position.left + mapPostion.left) - (containerRect.width/2) : position.left;

		self.container.style.top = -(position.top ) + 'px';
		self.container.style.left = -(position.left )+ 'px';
	});
};
