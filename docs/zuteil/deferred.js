define(["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.createDeferred = void 0;
    function createDeferred() {
        var _resolve;
        var _reject;
        var promise = new Promise(function (resolve, reject) {
            _resolve = resolve;
            _reject = reject;
        });
        promise.resolve = function (value) { return _resolve(value); };
        promise.reject = function (reason) { return _reject(reason); };
        return promise;
    }
    exports.createDeferred = createDeferred;
});
