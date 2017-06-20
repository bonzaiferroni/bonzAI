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
                    } else if (rangeToHostile === currentRange) {
                        fleePosition["dangerous"] = true;
                    }
                    fleePositions.push(fleePosition);
                }
            }
        }

        return fleePositions;
    };

    RoomPosition.prototype.bestFleePosition = function (hostile: Creep, ignoreRoads = false,
                                                        swampRat = false): RoomPosition {
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
                        } else if (option.veryDangerous) {
                            preference += 20;
                        }

                        if (hasRoad) {
                            if (ignoreRoads) {
                                preference += 2;
                            } else {
                                preference += 1;
                            }
                        } else if (terrain === "plain") {
                            preference += 2;
                        } else if (terrain === "swamp") {
                            if (swampRat) {
                                preference += 1;
                            } else {
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
        } else if (direction === 2) {
            y -= range;
            x += range;
        } else if (direction === 3) {
            x += range;
        } else if (direction === 4) {
            x += range;
            y += range;
        } else if (direction === 5) {
            y += range;
        } else if (direction === 6) {
            y += range;
            x -= range;
        } else if (direction === 7) {
            x -= range;
        } else if (direction === 8) {
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
        if (this.isNearExit(0)) { return false; }

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
     * Returns a structure of the specified type if it exists, otherwise returns null
     *
     * @param structureType
     * @returns {Structure}
     */
    RoomPosition.prototype.lookForStructure = function(structureType: string): Structure {
        let structures = this.lookFor(LOOK_STRUCTURES) as Structure[];
        return _.find(structures, x => x.structureType === structureType);
    };

    /**
     * Finds range to closest of an array of entities, returns null if range cannot be calculated
     *
     * @returns
     * @param positions
     */
    RoomPosition.prototype.getRangeToClosest = function(positions: {pos: RoomPosition}[] | RoomPosition[]): number {
        let closest = this.findClosestByRange(positions);
        if (!closest) { return Number.MAX_VALUE; }
        return this.getRangeTo(closest);
    };

    RoomPosition.prototype.terrainCost = function(): number {
        return {
            ["swamp"]: 5,
            ["plain"]: 1,
            ["wall"]: 0xff,
        }[Game.map.getTerrainAt(this)];
    };
}
