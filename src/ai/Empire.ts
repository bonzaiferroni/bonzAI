import {SpawnGroup} from "./SpawnGroup";
import {notifier} from "../notifier";
import {Profiler} from "../Profiler";
import {Traveler, traveler} from "./Traveler";
import {WorldMap} from "./WorldMap";
import {MarketTrader} from "./MarketTrader";
import {BonzaiDiplomat} from "./BonzaiDiplomat";
import {BonzaiNetwork} from "./BonzaiNetwork";
import {Visualizer} from "./Visualizer";
import {Scheduler} from "../Scheduler";

export class Empire {

    public spawnGroups: {[roomName: string]: SpawnGroup};
    public memory: {
        errantConstructionRooms: {};
    };

    public traveler: Traveler;
    public diplomat: BonzaiDiplomat;
    public map: WorldMap;
    public network: BonzaiNetwork;
    public market: MarketTrader;
    public vis: Visualizer;

    constructor() {
        if (!Memory.empire) { Memory.empire = {}; }
        _.defaults(Memory.empire, {
            errantConstructionRooms: {},
        });
        this.memory = Memory.empire;
    }

    /**
     * Occurs before operation phases
     */

    public init() {
        Profiler.start("emp.init");
        this.traveler = traveler;
        this.diplomat = new BonzaiDiplomat();
        this.map = new WorldMap(this.diplomat);
        this.spawnGroups = this.map.init();
        this.network = new BonzaiNetwork(this.map, this.diplomat);
        this.network.init();
        this.market = new MarketTrader(this.network);
        this.vis = new Visualizer();
        Profiler.end("emp.init");
    }

    /**
     * Occurs after operation phases
     */

    public actions() {
        Profiler.start("emp.map");
        this.map.actions();
        Profiler.end("emp.map");
        Profiler.start("emp.net");
        this.network.actions();
        Profiler.end("emp.net");
        Profiler.start("emp.mkt");
        this.market.actions();
        Profiler.end("emp.mkt");
        Profiler.start("emp.clr");
        this.clearErrantConstruction();
        Profiler.end("emp.clr");
        Profiler.start("emp.vis");
        this.vis.finalize();
        Profiler.end("emp.vis");

        for (let roomName in this.spawnGroups) {
            this.spawnGroups[roomName].finalize();
        }
    }

    public getSpawnGroup(roomName: string) {
        if (this.spawnGroups[roomName]) {
            return this.spawnGroups[roomName];
        } else {
            let room = Game.rooms[roomName];
            if (room && room.find(FIND_MY_SPAWNS).length > 0 && room.controller.level > 0) {
                this.spawnGroups[roomName] = new SpawnGroup(room);
                return this.spawnGroups[roomName];
            }
        }
    }

    public underCPULimit() {
        return Profiler.proportionUsed() < .8;
    }

    private clearErrantConstruction() {
        if (Scheduler.delay(this.memory, "clearErrantConstruction", 1000)) { return; }

        let removeErrantStatus = {};
        let addErrantStatus = {};
        for (let siteName in Game.constructionSites) {
            let site = Game.constructionSites[siteName];
            if (site.room) {
                delete this.memory.errantConstructionRooms[site.pos.roomName];
            } else {
                if (this.memory.errantConstructionRooms[site.pos.roomName]) {
                    site.remove();
                    removeErrantStatus[site.pos.roomName] = true;
                } else {
                    addErrantStatus[site.pos.roomName] = true;
                }
            }
        }

        for (let roomName in addErrantStatus) {
            this.memory.errantConstructionRooms[roomName] = true;
        }

        for (let roomName in removeErrantStatus) {
            notifier.log(`EMPIRE: removed construction sites in ${roomName}`);
            delete this.memory.errantConstructionRooms[roomName];
        }
    }

    public spawnFromClosest(pos: RoomPosition, body: string[], name: string) {
        let closest: SpawnGroup;
        let bestDistance = Number.MAX_VALUE;
        for (let roomName in this.spawnGroups) {
            let distance = Game.map.getRoomLinearDistance(pos.roomName, roomName);
            if (distance < bestDistance) {
                bestDistance = distance;
                closest = this.spawnGroups[roomName];
            }
        }
        return closest.spawn(body, name);
    }
}

export let empire: Empire = new Empire();
