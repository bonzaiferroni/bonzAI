import {BuildingPlannerData} from "../../interfaces";
import {MemHelper} from "../../helpers/MemHelper";
import {LayoutDisplay} from "./LayoutDisplay";
import {empire} from "../Empire";
import {Archiver} from "../Archiver";

export abstract class Layout {

    public map: PositionMap;
    public fixedMap: BuildingPlannerData;
    protected hasFlex: boolean;
    protected roomName: string;
    protected anchor: Vector2;
    protected rotation: number;
    protected tempMap: {[controllerLevel: number]: {[structureType: string]: Coord[] } };
    protected data: LayoutData;
    protected cacheTick: number;
    protected structureCache: {
        tick: number,
        idTick: number;
        ids: {[structureType: string]: string[]},
        objects: {[structureType: string]: Structure[]}
    } = {
        ids: {},
    } as any;

    constructor(roomName: string) {
        this.roomName = roomName;
    }

    public init() {
    }

    public update() {
        this.data = Memory.rooms[this.roomName].layout;
        this.findMap();
    }

    public simulateData(data: LayoutData) {
        this.data = data;
        this.findMap();
    }

    protected findMap() {
        if (this.map && this.cacheTick && this.cacheTick === this.data.cacheTick) {
            return;
        }

        if (this.data.cacheTick === undefined) {
            this.data.cacheTick = Game.time;
        }

        this.cacheTick = this.data.cacheTick;
        this.anchor = this.data.anchor;
        this.rotation = this.data.rotation;

        let flexMap: FlexMap;
        if (this.hasFlex) {
            if (!this.data.flex) {
                let generating = this.generateFlex();
                if (generating) {
                    console.log(`LAYOUT: generating flex map in ${this.roomName}`);
                    return;
                }
            }

            flexMap = Archiver.getSegmentProperty<FlexMap>(LAYOUT_SEGMENTID, this.roomName);
            if (!flexMap) {
                console.log(`ordering layout segment in ${this.roomName}`);
                return;
            }
        }

        this.map = this.consolidateMaps(flexMap);
    }

    public findFixedMap(): PositionMap {
        let structureTypes = Object.keys(CONSTRUCTION_COST);
        structureTypes.push("empty");
        let map = {};
        for (let structureType of structureTypes) {
            let positions = this.fixedPositions(structureType);
            if (!positions) { continue; }
            map[structureType] = positions;
        }
        return map;
    }

    public findStructures<T extends Structure>(structureType: string, useCache = true): T[] {
        let room = Game.rooms[this.roomName];
        if (!room || !this.map) { return; }

        if (Game.time !== this.structureCache.tick) {
            this.structureCache.tick = Game.time;
            this.structureCache.objects = {};
        }

        if (this.structureCache.objects[structureType]) {
            return this.structureCache.objects[structureType] as any;
        } else {
            this.structureCache.objects[structureType] = [];
        }

        let structures: T[] = [];
        if (this.structureCache.ids[structureType] && useCache) {
            for (let id of this.structureCache.ids[structureType]) {
                let obj = Game.getObjectById<T>(id);
                if (!obj) { continue; }
                structures.push(obj);
            }
        } else {
            this.structureCache.ids[structureType] = [];
            let positions = this.map[structureType];
            if (!positions) { return; }
            for (let position of positions) {
                let structure = position.lookForStructure(structureType) as T;
                if (!structure) { continue; }
                structures.push(structure);
            }
            this.structureCache.ids[structureType] = _.map(structures, x => x.id);
        }

        this.structureCache.objects[structureType] = structures;
        return structures;
    }

    public getAnchorPos() {
        return new RoomPosition(this.anchor.x, this.anchor.y, this.roomName);
    }

    protected findStructureTypes(): string[] {
        let structureTypes = Object.keys(CONSTRUCTION_COST);
        return structureTypes;
    }

    protected consolidateMaps(flexMap: FlexMap): PositionMap {
        let structureTypes = this.findStructureTypes();
        let map: PositionMap = {};
        for (let structureType of structureTypes) {
            let positions = [];
            let fixedPositions = this.fixedPositions(structureType);
            if (fixedPositions) {
                positions = positions.concat(fixedPositions);
            }
            let flexPositions = this.flexPositions(structureType, flexMap);
            if (flexPositions) {
                positions = positions.concat(flexPositions);
            }
            let tempPositions = this.tempPositions(structureType);
            if (tempPositions) {
                positions = positions.concat(tempPositions);
            }
            map[structureType] = positions;
        }

        if (this.data.turtle) {
            let turtlePositions = this.fixedPositions("turtle");
            if (turtlePositions) {
                map[STRUCTURE_RAMPART] = map[STRUCTURE_RAMPART].concat(turtlePositions);
            }
        }

        return map;
    }

    protected rotateDeltas(deltas: Vector2, rotation: number): Vector2 {
        let x = deltas.x;
        let y = deltas.y;
        if (rotation === 1) {
            x = -deltas.y;
            y = deltas.x;
        } else if (rotation === 2) {
            x = -deltas.x;
            y = -deltas.y;
        } else if (rotation === 3) {
            x = deltas.y;
            y = -deltas.x;
        }
        return {x: x, y: y};
    }

    protected fixedPosition(structureType: string, index: number): RoomPosition {
        if (!this.anchor || this.rotation === undefined) {
            console.log("no anchor or rotation specified");
            return;
        }

        let structureVector = this.fixedMap.buildings[structureType].pos[index];
        if (!structureVector) {
            return;
        }

        return this.coordToPosition(structureVector);
    }

    protected fixedPositions(structureType: string): RoomPosition[] {
        if (!this.fixedMap) { return; }

        let map = this.fixedMap.buildings[structureType];
        if (!map) {
            return;
        }

        return this.coordsToPositions(map.pos);
    }

    protected flexPositions(structureType: string, flexMap: FlexMap): RoomPosition[] {
        if (!flexMap) { return; }
        let serializedPositions = flexMap[structureType];
        if (!serializedPositions) {
            return;
        }
        return MemHelper.deserializeIntPositions(serializedPositions, this.roomName);
    }

    protected tempPositions(structureType: string): RoomPosition[] {
        if (!this.tempMap) { return; }
        let room = Game.rooms[this.roomName];
        if (!room || !this.tempMap[room.controller.level] || !this.tempMap[room.controller.level][structureType]) {
            return;
        }
        let coords = this.tempMap[room.controller.level][structureType];
        return this.coordsToPositions(coords);
    }

    protected generateFlex() {
        this.data.flex = true;
        return false;
    }

    public reset() {
        this.data.cacheTick = Game.time;
        Archiver.setSegmentProperty(LAYOUT_SEGMENTID, this.roomName, undefined);
    }

    public static serializePositionMap(flexMap: PositionMap) {
        let serializedMap = {};
        for (let structureType in flexMap) {
            let positions = flexMap[structureType];
            if (!positions) { continue; }
            serializedMap[structureType] = MemHelper.serializeIntPositions(positions);
        }
        return serializedMap;
    }

    private coordToPosition(structureVector: { x: number; y: number }) {
        let deltas = {
            x: structureVector.x - this.fixedMap.pivot.x,
            y: structureVector.y - this.fixedMap.pivot.y,
        };

        deltas = this.rotateDeltas(deltas, this.rotation);
        let x = this.anchor.x + deltas.x;
        let y = this.anchor.y + deltas.y;
        return new RoomPosition(x, y, this.roomName);
    }

    private coordsToPositions(coords: Vector2[]): RoomPosition[] {
        let positions = [];
        for (let coord of coords) {
            let position = this.coordToPosition(coord);
            positions.push(position);
        }
        return positions;
    }
}

export type Vector2 = {x: number, y: number}
export type PositionMap = {[structureType: string]: RoomPosition[] }
export type FlexMap = {[structureType: string]: string }

// deprecated, use constants instead
export enum LayoutType { Quad, Mini, Flex } // 0 === Quad, 1 === Mini, 2 === Flex

export const LAYOUT_SEGMENTID = 33; // set this to a value that will work with your memory setup
export interface LayoutData {
    type: string;
    anchor: Vector2;
    rotation: number;
    flex?: boolean;
    turtle?: boolean;
    cacheTick?: number;
}

export const LAYOUT_QUAD = "quad";
export const LAYOUT_FLEX = "flex";
export const LAYOUT_MINI = "mini";
export const LAYOUT_SWAP = "swap";
export const LAYOUT_CUSTOM = "custom";
