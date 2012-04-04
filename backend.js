
var 
	http = require('http'),
	express = require('express'),
	app = express.createServer(),
	io = require('socket.io').listen(app),
	EventEmitter = require('events').EventEmitter,
	url = require('url'),
	util = require('util');

http.globalAgent.maxSockets=10000;

function Profile(runner, options, profile) {
	this.runner = runner;
	this.options = options;
	this.profile = profile;
	this.status = 'idle';
}
util.inherits(Profile, EventEmitter);

Profile.prototype.stop = function() {
	if (this.status === 'active') {
		clearInterval(this.timer)
		this.status = 'idle';
	}
}

Profile.prototype.start = function() {
	if (this.status !== 'idle') {
		throw new Error("Must be in idle status to start profiling!");
	}

	var 
		self = this,
		runner = this.runner,
		options = this.options,
		profile = this.profile,
		start = Date.now(), 
		blockTime = 5, 
		requestsNeeded = 0,
		requestsSent = 0,
		waitingOn = 0,
		more = true;

	console.log("Starting profile")

	//Run the timer every 5ms
	this.timer = setInterval(function() {
		
		function finish() {
			if (more) {
				more = false;		
				self.stop();
			}
		}


		if (!more)
			return;

		var
			elapsed = Date.now() - start,
			requestsPerSecond = profile.base((elapsed)/1000),
			requestPerBlock = requestsPerSecond/(1000/blockTime);

		if (typeof options.timeLimit !== "undefined" && elapsed > options.timeLimit){
			console.warn("---------------------------------------------");
			return finish();
		}
			

		var neededForBlock = Math.floor(requestsNeeded + requestPerBlock - requestsSent);
		requestsNeeded += requestPerBlock;

		for(var i = 0; i < neededForBlock; ++i) {
			++waitingOn;
			//console.log(options)
			options.agent = false;
			runner.request(options, (function(requestsPerSecond, result) {
				
				result.time = Date.now() - start;
				result.requestsPerSecond = requestsPerSecond;

				//console.log(result)

				self.emit("result", result)
				--waitingOn;

				if (!more && waitingOn === 0) {
					finish();
					self.status = "idle"
					self.emit("end");
					return;
				}
			}).bind(undefined, requestsPerSecond));
			++requestsSent;
			if (typeof options.requestLimit !== "undefined" && (requestsSent >= options.requestLimit))
				return finish()
		}

		//console.log("There have been "+requestsSent+" requests sent.")



	}, blockTime);
	this.status = 'active';
}

function TestRunner() {

}

TestRunner.prototype.request = function(options, callback) {
	var startTime = Date.now() ;
	var request = http.request(options, function(response) {
		//Get how long it took to basically parse the recieve + parse headers
		//It's not a perfect measurement of latency, but it's decent enough
		var latency = Date.now() - startTime;

		response.on("error", function(message) {
			callback({
				type: "error",
				message: message,
				latency: latency,
				time: Date.now() - startTime
			})
		}).on("end", function() {

			//Note the result
			callback({
				type: "result",
				latency: latency,
				time: Date.now() - startTime
			})
		})

	});
	
	//Use the drain event as that is when data is actually flushed
	//out to the kernel
	request.on("drain", function() {
		startTime = Date.now()
	}).on("error", function() {
		//Note the error
		callback({
			type: "error"
		})
	});

	//Send out everything
	request.end();
}

TestRunner.prototype.profile = function(options, profile) {
	if (typeof profile.base !== "function")
		throw new TypeError("Profile must be a function!")

	var profile = new Profile(this, options, profile);
	profile.start();
	return profile;
}


var profiles = {

	linear: function(slope, initial) {
		slope = slope || 1
		initial = initial || 1;

		return {
			base: function(t) {
				return initial + t*slope;
			},
			derivative: function(t) {
				return slope;
			}
		}

	},

	exponential: function(base) {
		base = base || e;

		var 
			e = 2.71828183, 
			coeff = Math.log(base) / Math.log(e);
		return {
			base: function(t) {
				return Math.pow(base, t)
			},
			derivative: function(t) {
				return Math.pow(base, t) * coeff;
			}
		}
	},

	//http://mathworld.wolfram.com/SigmoidFunction.html
	sigmoid: function(x, y) {
		x = x || 0;
		y = y || 1;

		var e = 2.71828183
		return {
			base: function(t) {
				return 1*y / (1 + Math.pow(e, -(t-x)))
			},
			derivative: function(t) {
				return Math.pow(e, t) / Math.pow(1 + Math.pow(e, t), 2);
			}
		}
	}

}

var runner = new TestRunner();


io.sockets.on('connection', function(socket) {
	var currentProfile;

	socket.on('profile', function(options) {
		var results = [ ], done = false;

		//console.log(options)
		console.log(options.Field1);
		console.log(options.Field2);
		var parts = url.parse(options.url || "http://localhost")
		//console.log(parts)
		var opts = {	method: options.method || "GET",
				host: parts.hostname,
				port: parseInt(parts.port) || 8081,
				path: parts.path || '/',
				requestLimit: options.requestLimit*1 || 100000, //request limit is total requests
				timeLimit: options.timeLimit*1000 || 3600*1000, //timelimit is in ms
		};
		switch (options.function){
			case "linear":
				console.log("LINEARRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR");
				var profile = runner.profile(opts, profiles.linear(options.Field1*1, options.Field2*1));
				break;
			case "exponential":
				console.log("EXPPPPPPPPPPPPPPPPPPPPPPPPP");
				var profile = runner.profile(opts, profiles.exponential(options.Field1));
				break;
			case "sigmoid":
				console.log("SIGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG");
				var profile = runner.profile(opts, profiles.sigmoid(options.Field1*1,options.Field2*1));
				break;
			default:
				console.log("DEFAULT");
				var profile = runner.profile(opts, profiles.linear(10, 10));
				break;
			}

		currentProfile = profile;

		var timer = setInterval(function() {

			var 
				requestsPerSecond = 0, 
				latency = 0, 
				time = 0,
				count = results.length;

			if (count > 0) { 

				while (results.length > 0) {
					var result = results.pop();
					if (result.type === "result") {
						requestsPerSecond += result.requestsPerSecond;
						latency += result.latency;
						time += result.time;
					}
					else {
						--count;
					}
				}

				latency /= count;
				requestsPerSecond /= count;
				time /= count;

				socket.emit("result", {
					latency: latency,
					requestsPerSecond: requestsPerSecond,
					count: count,
					time: time
				})
			}

			if (done) {
				console.log("DONE");
				socket.emit("end");
				clearInterval(timer);
			}
		}, 500)

		profile.on("result", function(result) {
			results.push(result)
		}).on("end", function() {
			//console.warn("DFsdfsdfsdfsdddddddddddddddddddddddddddddddddddddddddddddddddd");
			done = true;
		})

	}).on("stop", function() {
		currentProfile.stop();
	})
})

app.use(express.static(__dirname));

app.listen(8081)
