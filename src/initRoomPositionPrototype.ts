export function initRoomPositionPrototype() {
    RoomPosition.prototype.isNearExit = function(range: number): boolean {
        return this.x - range <= 0 || this.x + range >= 49 || this.y - range <= 0 || this.y + range >= 49;
    };

    RoomPosition.prototype.getFleeOptions = function (roomObject: RoomObject): RoomPosition[] {
        let fleePositions = [];
        let currentRange = this.getRangeTo(roomObject);

        for (let i = 1; i <= 8; i++) {
            let fleePosition = this.getPositionAtDirection(i);
            if (fleePosition.x > 0 && fleePosition.x < 49 && fleePosition.y > 0 && fleePosition.y < 49) {
                let rangeToHostile = fleePosition.getRangeTo(roomObject);
                if (rangeToHostile > 0) {
                    if (rangeToHostile < currentRange) {
                        fleePosition["veryDangerous"] = true;
                    }
                    else if (rangeToHostile === currentRange) {
                        fleePosition["dangerous"] = true;
                    }
                    fleePositions.push(fleePosition);
                }
            }
        }

        return fleePositions;
    };

    RoomPosition.prototype.bestFleePosition = function (hostile: Creep, ignoreRoads = false, swampRat = false): RoomPosition {
        let options = [];

        let fleeOptions = this.getFleeOptions(hostile);
        for (let i = 0; i < fleeOptions.length; i++) {
            let option = fleeOptions[i];
            let terrain = option.lookFor(LOOK_TERRAIN)[0];
            if (terrain !== "wall") {
                let creepsInTheWay = option.lookFor(LOOK_CREEPS);
                if (creepsInTheWay.length === 0) {
                    let structures = option.lookFor(LOOK_STRUCTURES);
                    let hasRoad = false;
                    let impassible = false;
                    for (let structure of structures) {
                        if (_.includes(OBSTACLE_OBJECT_TYPES, structure.structureType)) {
                            // can't go through it
                            impassible = true;
                            break;
                        }
                        if (structure.structureType === STRUCTURE_ROAD) {
                            hasRoad = true;
                        }
                    }

                    if (!impassible) {
                        let preference = 0;

                        if (option.dangerous) {
                            preference += 10;
                        }
                        else if (option.veryDangerous) {
                            preference += 20;
                        }

                        if (hasRoad) {
                            if (ignoreRoads) {
                                preference += 2;
                            }
                            else {
                                preference += 1;
                            }
                        }
                        else if (terrain === "plain") {
                            preference += 2;
                        }
                        else if (terrain === "swamp") {
                            if (swampRat) {
                                preference += 1;
                            }
                            else {
                                preference += 5;
                            }
                        }

                        options.push({position: option, preference: preference});
                    }
                }
            }
        }

        if (options.length > 0) {
            options = _(options)
                .shuffle()
                .sortBy("preference")
                .value();

            return options[0].position;
        }
    };


    /**
     * Returns the nearest object to the current position based on the linear distance of rooms;
     * @param roomObjects
     * @returns {any}
     */
    RoomPosition.prototype.findClosestByRoomRange = function (roomObjects: {pos: RoomPosition}[]): {pos: RoomPosition} {
        if (roomObjects.length === 0) return;
        let sorted = _.sortBy(roomObjects,
            (s: {pos: RoomPosition}) => Game.map.getRoomLinearDistance(s.pos.roomName, this.roomName));
        return _.head(sorted);
    };

    /**
     * Returns the nearest object to the current position, works for objects that may not be in the same room;
     * @param roomObjects
     * @returns {any}
     */

    RoomPosition.prototype.findClosestByLongPath = function (roomObjects: {pos: RoomPosition}[]): {pos: RoomPosition} {
        if (roomObjects.length === 0) return;

        let sorted = _.sortBy(roomObjects,
            (s: {pos: RoomPosition}) => Game.map.getRoomLinearDistance(s.pos.roomName, this.roomName));

        let closestLinearDistance = Game.map.getRoomLinearDistance(sorted[0].pos.roomName, this.roomName);
        if (closestLinearDistance >= 5) {
            return sorted[0];
        }

        let acceptableRange = closestLinearDistance + 1;
        let filtered = _.filter(sorted,
            (s: {pos: RoomPosition}) => Game.map.getRoomLinearDistance(s.pos.roomName, this.roomName) <= acceptableRange);

        let bestPathLength = Number.MAX_VALUE;
        let bestObject;
        for (let roomObject of filtered) {
            let results = PathFinder.search(this, { pos: roomObject.pos, range: 1 });
            if (results.incomplete) {
                console.log("findClosestByLongPath: object in", roomObject.pos.roomName, "was overlooked");
                continue;
            }

            let pathLength = results.path.length;

            if (pathLength < bestPathLength) {
                bestObject = roomObject;
                bestPathLength = pathLength;
            }
        }

        return bestObject;
    };

    /**
     * Returns all surrounding positions that are currently open
     * @param ignoreCreeps - if true, will consider positions containing a creep to be open
     * @returns {RoomPosition[]}
     */
    RoomPosition.prototype.openAdjacentSpots = function (ignoreCreeps?: boolean): RoomPosition[] {
        let positions = [];
        for (let i = 1; i <= 8; i++) {
            let testPosition = this.getPositionAtDirection(i);

            if (testPosition.isPassible(ignoreCreeps)) {
                // passed all tests
                positions.push(testPosition);
            }
        }
        return positions;
    };

    /**
     * returns position at direction relative to this position
     * @param direction
     * @param range - optional, can return position with linear distance > 1
     * @returns {RoomPosition}
     */
    RoomPosition.prototype.getPositionAtDirection = function(direction: number, range?: number): RoomPosition {
        if (!range) {
            range = 1;
        }
        let x = this.x;
        let y = this.y;
        let room = this.roomName;

        if (direction === 1) {
            y -= range;
        }
        else if (direction === 2) {
            y -= range;
            x += range;
        }
        else if (direction === 3) {
            x += range;
        }
        else if (direction === 4) {
            x += range;
            y += range;
        }
        else if (direction === 5) {
            y += range;
        }
        else if (direction === 6) {
            y += range;
            x -= range;
        }
        else if (direction === 7) {
            x -= range;
        }
        else if (direction === 8) {
            x -= range;
            y -= range;
        }
        return new RoomPosition(x, y, room);
    };

    /**
     * Look if position is currently open/passible
     * @param ignoreCreeps - if true, consider positions containing creeps to be open
     * @returns {boolean}
     */
    RoomPosition.prototype.isPassible = function(ignoreCreeps?: boolean): boolean {
        // look for walls
        if (_.head(this.lookFor(LOOK_TERRAIN)) !== "wall") {

            // look for creeps
            if (ignoreCreeps || this.lookFor(LOOK_CREEPS).length === 0) {

                // look for impassible structions
                if (_.filter(this.lookFor(LOOK_STRUCTURES), (struct: Structure) => {
                        return struct.structureType !== STRUCTURE_ROAD
                            && struct.structureType !== STRUCTURE_CONTAINER
                            && struct.structureType !== STRUCTURE_RAMPART;
                    }).length === 0 ) {

                    // passed all tests
                    return true;
                }
            }
        }

        return false;
    };

    /**
     * @param structureType
     * @returns {Structure} structure of type structureType that resides at position (null if no structure of that type is present)
     */
    RoomPosition.prototype.lookForStructure = function(structureType: string): Structure {
        let structures = this.lookFor(LOOK_STRUCTURES);
        return _.find(structures, {structureType: structureType}) as Structure;
    };

    /**
     *
     */
    RoomPosition.prototype.walkablePath = function (pos: RoomPosition): RoomPosition[] {
        let ret = PathFinder.search(this, { pos: pos, range: 1 }, {
            maxOps: 3000,
            plainCost: 2,
            swampCost: 10,
            roomCallback: (roomName: string) => {
                let room = Game.rooms[roomName];
                if (room) {

                    if (!room.basicMatrix) {
                        let costs = new PathFinder.CostMatrix();
                        let structures = room.find<Structure>(FIND_STRUCTURES);
                        for (let structure of structures) {
                            if (structure.structureType === STRUCTURE_ROAD) {
                                costs.set(structure.pos.x, structure.pos.y, 1);
                            }
                        }
                        room.basicMatrix = costs;
                    }

                    return room.basicMatrix;
                }
            }
        });
        if (ret.incomplete) {
            console.log("ERROR: roomPosition.walkablePath(pos) PathFinding was incomplete, ops:", ret.ops);
        }
        else {
            return ret.path;
        }
    };

    RoomPosition.prototype.getPathDistanceTo = function(pos: RoomPosition): number {
        let path = this.walkablePath(pos);
        if (path) {
            return path.length;
        }
        else {
            return Game.map.getRoomLinearDistance(pos.roomName, this.roomName) * 50;
        }
    };
}