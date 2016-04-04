/**

 Copyright 2016 Klaus Landsdorf

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

 **/


describe("jasmine.arrayContaining", function() {
    var foo;

    beforeEach(function() {
        foo = [1, 2, 3, 4];
    });

    it("matches arrays with some of the values", function() {
        expect(foo).toEqual(jasmine.arrayContaining([3, 1]));
        expect(foo).not.toEqual(jasmine.arrayContaining([6]));
    });

    describe("when used with a spy", function() {
        it("is useful when comparing arguments", function() {
            var callback = jasmine.createSpy('callback');

            callback([1, 2, 3, 4]);

            expect(callback).toHaveBeenCalledWith(jasmine.arrayContaining([4, 2, 3]));
            expect(callback).not.toHaveBeenCalledWith(jasmine.arrayContaining([5, 2]));
        });
    });
});


describe("jasmine.any", function() {
    it("matches any value", function() {
        expect({}).toEqual(jasmine.any(Object));
        expect(12).toEqual(jasmine.any(Number));
    });

    describe("when used with a spy", function() {
        it("is useful for comparing arguments", function() {
            var foo = jasmine.createSpy('foo');
            foo(12, function() {
                return true;
            });

            expect(foo).toHaveBeenCalledWith(jasmine.any(Number), jasmine.any(Function));
        });
    });
});