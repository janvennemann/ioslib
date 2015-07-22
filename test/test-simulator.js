/**
 * Tests ioslib's simulator module.
 *
 * @copyright
 * Copyright (c) 2014-2015 by Appcelerator, Inc. All Rights Reserved.
 *
 * @license
 * Licensed under the terms of the Apache Public License.
 * Please see the LICENSE included with this distribution for details.
 */

const
	appc = require('node-appc'),
	exec = require('child_process').exec,
	fs = require('fs'),
	ioslib = require('..'),
	path = require('path');

function checkSims(sims) {
	should(sims).be.an.Array;
	sims.forEach(function (sim) {
		should(sim).be.an.Object;
		should(sim).have.keys('deviceType', 'udid', 'type', 'name', 'ios', 'retina', 'tall', '64bit', 'resizable', 'supportsWatch', 'xcode', 'xcodePath', 'simulator', 'simctl', 'systemLog', 'logPaths');

		should(sim.deviceType).be.a.String;
		should(sim.deviceType).not.equal('');

		should(sim.udid).be.a.String;
		should(sim.udid).not.equal('');

		should(sim.type).be.a.String;
		should(sim.type).not.equal('');

		should(sim.name).be.a.String;
		should(sim.name).not.equal('');

		should(sim.ios).be.a.String;
		should(sim.ios).not.equal('');

		should(sim.retina).be.a.Boolean;

		should(sim.tall).be.a.Boolean;

		should(sim['64bit']).be.a.Boolean;

		should(sim.resizable).be.a.Boolean;

		should(sim.xcode).be.a.String;
		should(sim.xcode).not.equal('');

		should(sim.xcodePath).be.a.String;
		should(sim.xcodePath).not.equal('');

		should(sim.simulator).be.a.String;
		should(sim.simulator).not.equal('');
		should(fs.existsSync(sim.simulator)).be.true;

		should(sim.simctl).be.a.String;
		should(sim.simctl).not.equal('');
		should(fs.existsSync(sim.simctl)).be.true;

		should(sim.systemLog).be.a.String;
		should(sim.systemLog).not.equal('');

		should(sim.logPaths).be.an.Array;
		should(sim.logPaths).not.length(0);
	});
}

function build(app, iosVersion, defs, done){
	if (typeof defs === 'function') {
		done = defs;
		defs = [];
	}

	ioslib.xcode.detect(function (err, env) {
		if (err) {
			return done(err);
		}

		var xc = null,
			ios;

		Object.keys(env.xcode).sort().reverse().some(function (ver) {
			return env.xcode[ver].sdks.some(function (sdk) {
				if (!iosVersion || appc.version.satisfies(sdk, iosVersion)) {
					xc = env.xcode[ver];
					iosVersion = sdk;
					return true;
				}
			});
		});

		if (xc === null) {
			return done(new Error('No selected Xcode'));
		}

		var cmd = [
			xc.executables.xcodebuild,
			'clean', 'build',
			'-configuration', 'Debug',
			'-scheme', app,
			'-destination', "platform='iOS Simulator',OS=" + appc.version.format(iosVersion, 2, 2) + ",name='iPhone 6'",
			'GCC_PREPROCESSOR_DEFINITIONS="' + defs.join(' ') + '"',
			'CONFIGURATION_BUILD_DIR="build/\\$(CONFIGURATION)\\$(EFFECTIVE_PLATFORM_NAME)"'
		];

		//console.log(cmd.join(' '));
		exec(cmd.join(' '), {
			cwd: path.join(__dirname, app)
		}, function (code, out, err) {
			//console.log(out);
			should(out).match(/BUILD SUCCEEDED/);
			var appPath = path.join(__dirname, app, 'build', 'Debug-iphonesimulator', app + '.app');
			should(fs.existsSync(appPath)).be.true;
			done(null, appPath);
		});
	});
}

function timochaLogWatcher(emitter, callback) {
	typeof callback === 'function' || (callback = function () {});

	var inTiMochaResult = false,
		tiMochaResults = [],
		logLevelRegExp = /^\[\w+\]\s*/;

	function watch(line) {
		line = line.replace(logLevelRegExp, '');

		if (line === 'TI_MOCHA_RESULT_START') {
			inTiMochaResult = true;
		} else if (inTiMochaResult && line === 'TI_MOCHA_RESULT_STOP') {
			emitter.removeListener('log', watch);
			emitter.removeListener('log-file', watch);
			try {
				callback(null, tiMochaResults.length ? JSON.parse(tiMochaResults.join('\n').trim()) : {});
			} catch (ex) {
				callback(new Error('Results are not valid JSON'));
			}
		} else if (inTiMochaResult && line) {
			tiMochaResults.push(line);
		}
	}

	emitter.on('log', watch);
	emitter.on('log-file', watch);
}

describe('simulator', function () {
	it('namespace should be an object', function () {
		should(ioslib.simulator).be.an.Object;
	});

	it('detect iOS Simulators', function (done) {
		this.timeout(5000);
		this.slow(2000);

		ioslib.simulator.detect(function (err, results) {
			if (err) {
				return done(err);
			}

			should(results).be.an.Object;
			should(results).have.keys('simulators', 'watchSimulators', 'devicePairs', 'crashDir', 'issues');

			should(results.simulators).be.an.Object;
			Object.keys(results.simulators).forEach(function (ver) {
				checkSims(results.simulators[ver]);
			});

			should(results.crashDir).be.a.String;
			should(results.crashDir).not.equal('');
			if (fs.existsSync(results.crashDir)) {
				should(fs.statSync(results.crashDir).isDirectory()).be.true;
			}

			should(results.issues).be.an.Array;
			results.issues.forEach(function (issue) {
				should(issue).be.an.Object;
				should(issue).have.keys('id', 'type', 'message');
				should(issue.id).be.a.String;
				should(issue.type).be.a.String;
				should(issue.type).match(/^info|warning|error$/);
				should(issue.message).be.a.String;
			});

			done();
		});
	});

	(process.env.TRAVIS ? it.skip : it)('should launch the default simulator and stop it', function (done) {
		this.timeout(30000);
		this.slow(30000);

		ioslib.simulator.launch(null, null, function (err, simHandle) {
			exec('ps -ef', function (code, out, err) {
				if (code) {
					return done(err);
				}

				should(out.split('\n').filter(function (line) { return line.indexOf(simHandle.simulator) !== -1; })).not.length(0);

				ioslib.simulator.stop(simHandle, function () {
					done();
				});
			});
		});
	});

	(process.env.TRAVIS ? it.skip : it)('should be able to launch simulator and log basic logs', function (done) {
		this.timeout(30000);
		this.slow(30000);

		build('TestApp', null, ['TEST_BASIC_LOGGING'], function (err, appPath) {
			should(err).not.be.ok;
			should(appPath).be.a.String;
			should(fs.existsSync(appPath)).be.ok;

			var counter = 0,
				launched = false,
				started = false;

			ioslib.simulator.launch(null, {
				appPath: appPath,
				autoExit: true,
				hide: true
			}).on('log', function (line) {
				counter++;
			}).on('launched', function (simHandle) {
				launched = true;
			}).on('error', function (err) {
				done(err);
			}).on('app-started', function (simHandle) {
				started = true;
			}).on('app-quit', function (err) {
				should(err).not.be.ok;
				should(launched).be.ok;
				should(started).be.ok;
				should(counter).not.equal(0);
				done();
			});
		});
	});

	(process.env.TRAVIS ? it.skip : it)('should be able to launch simulator and log ti mocha results', function (done) {
		this.timeout(30000);
		this.slow(30000);

		build('TestApp', null, ['TEST_TIMOCHA'], function (err, appPath) {
			should(err).not.be.ok;
			should(appPath).be.a.String;
			should(fs.existsSync(appPath)).be.ok;

			var simHandle,
				n = 0,
				emitter = ioslib.simulator.launch(null, {
					appPath: appPath,
					hide: true
				});

			function stop() {
				if (++n === 2) {
					ioslib.simulator.stop(simHandle, function () {
						done();
					});
				}
			}

			emitter.on('launched', function (handle) {
				simHandle = handle;
				stop();
			}).on('error', function (err) {
				done(err);
			});

			timochaLogWatcher(emitter, function (err, results) {
				should(err).not.be.ok;
				should(results).be.an.Object;
				should(results).have.property('foo', 'bar');
				stop();
			});
		});
	});

	(process.env.TRAVIS ? it.skip : it)('should be able to launch simulator and log ti mocha results with multiple lines', function (done) {
		this.timeout(30000);
		this.slow(30000);

		build('TestApp', null, ['TEST_TIMOCHA_MULTIPLE_LINES'], function (err, appPath) {
			should(err).not.be.ok;
			should(appPath).be.a.String;
			should(fs.existsSync(appPath)).be.ok;

			var simHandle,
				n = 0,
				emitter = ioslib.simulator.launch(null, {
					appPath: appPath,
					hide: true
				});

			function stop() {
				if (++n === 2) {
					ioslib.simulator.stop(simHandle, function () {
						done();
					});
				}
			}

			emitter.on('launched', function (handle) {
				simHandle = handle;
				stop();
			}).on('error', function (err) {
				done(err);
			});

			timochaLogWatcher(emitter, function (err, results) {
				should(err).not.be.ok;
				should(results).be.an.Object;
				should(results).have.property('foo', 'bar');
				stop();
			});
		});
	});

	(process.env.TRAVIS ? it.skip : it)('should be able to launch simulator and detect crash with Objective-C exception', function (done) {
		this.timeout(30000);
		this.slow(30000);

		build('TestApp', null, ['TEST_OBJC_CRASH'], function (err, appPath) {
			should(err).not.be.ok;
			should(appPath).be.a.String;
			should(fs.existsSync(appPath)).be.ok;

			var simHandle;

			ioslib.simulator.launch(null, {
				appPath: appPath,
				hide: true
			}).on('launched', function (handle) {
				simHandle = handle;
			}).on('error', function (err) {
				done(err);
			}).on('app-quit', function (crash) {
				// stop the simulator before we start throwing exceptions
				ioslib.simulator.stop(simHandle, function () {
					try {
						should(crash).be.an.instanceOf(ioslib.simulator.SimulatorCrash);
						should(crash.toString()).eql('SimulatorCrash: App crashed in the iOS Simulator');
						should(crash).have.property('crashFiles');
						should(crash.crashFiles).be.an.Array;
						crash.crashFiles.forEach(function (file) {
							should(fs.existsSync(file)).be.ok;
						});
					} finally {
						if (crash && Array.isArray(crash.crashFiles)) {
							crash.crashFiles.forEach(function (file) {
								fs.existsSync(file) && fs.unlinkSync(file);
							});
						}
					}

					done();
				});
			});
		});
	});

	(process.env.TRAVIS ? it.skip : it)('should be able to launch simulator and detect crash with C exception', function (done) {
		this.timeout(30000);
		this.slow(30000);

		build('TestApp', null, ['TEST_C_CRASH'], function (err, appPath) {
			should(err).not.be.ok;
			should(appPath).be.a.String;
			should(fs.existsSync(appPath)).be.ok;

			var simHandle;

			ioslib.simulator.launch(null, {
				appPath: appPath,
				hide: true
			}).on('launched', function (handle) {
				simHandle = handle;
			}).on('error', function (err) {
				done(err);
			}).on('app-quit', function (crash) {
				// stop the simulator before we start throwing exceptions
				ioslib.simulator.stop(simHandle, function () {
					try {
						should(crash).be.an.instanceOf(ioslib.simulator.SimulatorCrash);
						should(crash.toString()).eql('SimulatorCrash: App crashed in the iOS Simulator');

						should(crash).have.property('crashFiles');
						should(crash.crashFiles).be.an.Array;
						crash.crashFiles.forEach(function (file) {
							should(fs.existsSync(file)).be.ok;
						});
					} finally {
						if (crash && Array.isArray(crash.crashFiles)) {
							crash.crashFiles.forEach(function (file) {
								fs.existsSync(file) && fs.unlinkSync(file);
							});
						}
					}

					done();
				});
			});
		});
	});

	(process.env.TRAVIS ? it.skip : it)('should launch the default simulator and launch the watchOS 1 app', function (done) {
		this.timeout(30000);
		this.slow(30000);

		build('TestWatchApp', '>=8.2 <9.0', ['TEST_BASIC_LOGGING'], function (err, appPath) {
			should(err).not.be.ok;
			should(appPath).be.a.String;
			should(fs.existsSync(appPath)).be.ok;

			ioslib.simulator.detect(function (err, simulators) {
				var ver = Object.keys(simulators.ios).filter(function (ver) { return appc.version.gte(ver, '8.2') && appc.version.lt(ver, '9.0'); }).sort().pop(),
					udid = simulators.ios[ver][simulators.ios[ver].length - 1].udid;

				ioslib.simulator.launch(udid, {
					appPath: appPath,
					hide: true,
					launchWatchApp: true
				}).on('launched', function (simHandle) {
					ioslib.simulator.stop(simHandle, function () {
						done();
					});
				}).on('error', function (err) {
					done(err);
				});
			});
		});
	});


	(process.env.TRAVIS ? it.skip : it.only)('should launch the default simulator and launch the watchOS 2 app', function (done) {
		this.timeout(30000);
		this.slow(30000);

		build('TestWatchApp2', '9.x', ['TEST_BASIC_LOGGING'], function (err, appPath) {
			should(err).not.be.ok;
			should(appPath).be.a.String;
			should(fs.existsSync(appPath)).be.ok;

			ioslib.simulator.detect(function (err, simulators) {
				var ver = Object.keys(simulators.ios).filter(function (ver) { return appc.version.gte(ver, '9.0'); }).sort().pop(),
					udid = simulators.ios[ver][simulators.ios[ver].length - 1].udid;

				ioslib.simulator.launch(udid, {
					appPath: appPath,
					//hide: true,
					launchWatchApp: true
				}).on('log-debug', function (line) {
					console.log(line);
				}).on('launched', function (simHandle, watchSimHandle) {
					//ioslib.simulator.stop(simHandle, function () {
						done();
					//});
				}).on('error', function (err) {
					done(err);
				});
			});
		});
	});

});