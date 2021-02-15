var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
define(["require", "exports", "./deferred"], function (require, exports, deferred_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.JobDispatcher = void 0;
    var FAILURE;
    (function (FAILURE) {
        FAILURE["TIMEOUT"] = "TIMEOUT";
        FAILURE["ERROR"] = "ERROR";
        FAILURE["CANCELLED"] = "CANCELLED";
    })(FAILURE || (FAILURE = {}));
    var JobDispatcher = (function () {
        function JobDispatcher(config) {
            if (config === void 0) { config = {}; }
            this.stack = [];
            this.cancelJobs = deferred_1.createDeferred();
            this.status = {
                running: 0,
                failed: 0,
                pending: 0,
                succeeded: 0,
                timedOut: 0,
                total: 0
            };
            this.listeners = [];
            this.config = __assign({ concurrentLimit: Infinity, maxAttempts: 1, isPaused: config.startImmediate !== undefined ? !config.startImmediate : true, stopWhenDone: false, timeout: -1 }, config);
        }
        JobDispatcher.getInstance = function (config) {
            if (!this.instance) {
                this.instance = new JobDispatcher(config);
            }
            return this.instance;
        };
        JobDispatcher.prototype.start = function () {
            this.config.isPaused = false;
            this.cancelJobs = deferred_1.createDeferred();
            this.update();
        };
        JobDispatcher.prototype.stop = function (cancelRunningJobs) {
            if (cancelRunningJobs === void 0) { cancelRunningJobs = false; }
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            this.config.isPaused = true;
                            if (!cancelRunningJobs) return [3, 2];
                            this.cancelJobs.resolve(FAILURE.CANCELLED);
                            return [4, new Promise(function (r) { return setTimeout(r); })];
                        case 1:
                            _a.sent();
                            _a.label = 2;
                        case 2: return [2];
                    }
                });
            });
        };
        JobDispatcher.prototype.addJob = function (job, immediate, ignoreJobLimit) {
            if (immediate === void 0) { immediate = false; }
            if (ignoreJobLimit === void 0) { ignoreJobLimit = false; }
            return __awaiter(this, void 0, void 0, function () {
                var deferred;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            this.status.total++;
                            this.status.pending++;
                            deferred = deferred_1.createDeferred();
                            immediate
                                ? this.stack.unshift(deferred)
                                : this.stack.push(deferred);
                            this.update(ignoreJobLimit);
                            return [4, deferred];
                        case 1:
                            _a.sent();
                            return [2, this.executeJob(job)];
                    }
                });
            });
        };
        JobDispatcher.prototype.attachListener = function (listener) {
            var _this = this;
            if (!this.listeners.includes(listener)) {
                this.listeners.push(listener);
            }
            return function () { return _this.detachListener(listener); };
        };
        JobDispatcher.prototype.detachListener = function (listener) {
            this.listeners = this.listeners.filter(function (l) { return l !== listener; });
        };
        JobDispatcher.prototype.executeJob = function (job) {
            return __awaiter(this, void 0, void 0, function () {
                var isUnsuccessful, jobresult, attempt, timeout, result;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            isUnsuccessful = function (result) {
                                var failedResults = [
                                    FAILURE.ERROR,
                                    FAILURE.TIMEOUT
                                ];
                                return failedResults.includes(result);
                            };
                            jobresult = null;
                            attempt = 1;
                            _a.label = 1;
                        case 1:
                            if (!(attempt === 1 || isUnsuccessful(jobresult) && attempt <= this.config.maxAttempts)) return [3, 3];
                            console.log("attempt", attempt);
                            attempt++;
                            timeout = this.config.timeout >= 0
                                ? new Promise(function (r) { return setTimeout(function () { return r(FAILURE.TIMEOUT); }, _this.config.timeout); })
                                : new Promise(function () { });
                            result = job().catch(function () { return FAILURE.ERROR; });
                            return [4, Promise.race([timeout, result, this.cancelJobs])];
                        case 2:
                            jobresult = _a.sent();
                            return [3, 1];
                        case 3: return [2, this.onJobComplete(job, jobresult)];
                    }
                });
            });
        };
        JobDispatcher.prototype.onJobComplete = function (job, jobresult) {
            return __awaiter(this, void 0, void 0, function () {
                var finalResult;
                return __generator(this, function (_a) {
                    finalResult = null;
                    this.status.running--;
                    if (jobresult === FAILURE.ERROR) {
                        this.status.failed++;
                    }
                    else if (jobresult === FAILURE.TIMEOUT) {
                        this.status.timedOut++;
                    }
                    else if (jobresult === FAILURE.CANCELLED) {
                        this.status.total--;
                        finalResult = this.addJob(job, true);
                    }
                    else {
                        this.status.succeeded++;
                        finalResult = jobresult;
                    }
                    this.update();
                    return [2, finalResult];
                });
            });
        };
        JobDispatcher.prototype.notifyListeners = function () {
            var _this = this;
            this.listeners.forEach(function (l) { return l(_this.status); });
        };
        JobDispatcher.prototype.update = function (ignoreJobLimit) {
            if (ignoreJobLimit === void 0) { ignoreJobLimit = false; }
            while (!this.config.isPaused
                && this.stack.length > 0
                && (this.status.running < this.config.concurrentLimit || ignoreJobLimit)) {
                ignoreJobLimit = false;
                this.status.running++;
                this.status.pending--;
                var waiter = this.stack.shift();
                waiter.resolve();
            }
            this.notifyListeners();
        };
        JobDispatcher.instance = null;
        return JobDispatcher;
    }());
    exports.JobDispatcher = JobDispatcher;
});
