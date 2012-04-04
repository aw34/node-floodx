jQuery.fn.form = function() {
	var elem = this;
	while (!elem.is("form"))
		elem = elem.parent();
	return elem;
}

jQuery.fn.object = function() {
	var inputs = $(this).form();
	var obj = {};
	vals = inputs.serializeArray();
	for (var i in vals) {
		var val = vals[i];
		if (typeof obj[val.name] === "undefined")
			obj[val.name] = val.value;
		else if (Array.isArray(obj[val.name]))
			obj[val.name].push(val.value);
		else
			obj[val.name] = [obj[val.name], val.value];        
	}
	return obj;
}

$(function() {
	var socket = io.connect('http://localhost');
	

	var chart = new Highcharts.Chart({
		chart: {
			renderTo: 'Chart',
			zoomType: 'xy'
			
		},

		title: {
			text: 'Performance Analysis'
		},
		
		xAxis: [{
			categories: ['+sec+'],
			formatter: function() {
				return '<b>'+ this.series.name+Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', this.x)
			},
			title: {
				text: 'Time'
			 }
		}],

		yAxis: [{
			labels: {
				formatter: function() {
					return this.value +' Requests/second';
				},
				style: {
					color: '#89A54E'
				}
			},
			title: {
				text: 'Request/Second',
				style: {
					color: '#89A54E'
				}
			},
			opposite: true
		}, {
			title: {
				text: 'Latency',
				style: {
					color: '#4572A7'
				}
			},
			labels: {
				formatter: function() {
					return this.value +' millisecond' + (this.value !== 1 ? 's' : '');
				},
				style: {
					color: '#4572A7'
				}
			}
		}],
		series: [{
			name: 'Requests/Second',
			color: '#89A54E',
			type: 'spline',
			data: []
		}, {
			name: 'Latency',
			color: '#4572A7',
			type: 'spline',
			yAxis: 1,
			data: []
		}]
	});

	$("#ProfileForm").bind("submit", function() {
		var submit = $(this).find("input[type=submit]");
		if (submit.val() === "Start") {
			//submit.attr("disabled", "disabled");
			chart.series[0].setData([], false);
			chart.series[1].setData([], false);
			//alert($(this).object().requestLimit);
			chart.redraw();
			//alert("111111");

			submit.attr("value", "Stop");
			socket.emit("profile", $(this).object());
			
		}else if (submit.val() === "Stop"){

			socket.emit("stop");
			submit.attr("value", "Start");
		}
		return false;
	})



	socket.on("profile", function() {
		$("#ProfileForm").find("input[type=submit]").removeAttr("disabled").val("Stop");
	}).on("result", function(result) {
		var x = result.time/1000;
		chart.series[0].addPoint([x, result.requestsPerSecond], false, chart.series[0].data.length > 20);
		chart.series[1].addPoint([x, result.latency], true, chart.series[1].data.length > 20);
	}).on("end", function() {
		console.log("Done");
		$("#ProfileForm").find("input[type=submit]").val("Start");
	})

})




