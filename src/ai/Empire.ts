import {SpawnGroup} from "./SpawnGroup";
import {notifier} from "../notifier";
import {Profiler} from "../Profiler";
import {Traveler, traveler} from "./Traveler";
import {WorldMap} from "./WorldMap";
import {MarketTrader} from "./MarketTrader";
import {BonzaiDiplomat} from "./BonzaiDiplomat";
import {BonzaiNetwork} from "./BonzaiNetwork";
import {Scheduler} from "../Scheduler";
import {Archiver} from "./Archiver";

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
    public archiver: Archiver;

    constructor() {
        if (!Memory.empire) { Memory.empire = {}; }
        _.defaults(Memory.empire, {
            errantConstructionRooms: {},
        });
        this.memory = Memory.empire;
    }

    public initGlobal() {
        this.traveler = traveler;
        this.diplomat = new BonzaiDiplomat();
        this.map = new WorldMap(this.diplomat);
        this.spawnGroups = this.map.initGlobal();
        this.network = new BonzaiNetwork(this.map, this.diplomat);
        this.market = new MarketTrader(this.network);

        for (let roomName in this.spawnGroups) {
            let spawnGroup = this.spawnGroups[roomName];
            spawnGroup.initGlobal();
        }
    }

    /**
     * Occurs before operation phases
     */

    public init() {
        Profiler.start("emp.init");
        for (let roomName in this.spawnGroups) {
            let spawnGroup = this.spawnGroups[roomName];
            let initilized = spawnGroup.init();
            if (!initilized) {
                delete this.spawnGroups[roomName];
            }
        }
        this.map.init();
        this.network.init();
        this.archiver = new Archiver();
        this.archiver.init();
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
        this.archiver.finalize();

        for (let roomName in this.spawnGroups) {
            this.spawnGroups[roomName].finalize();
        }
    }

    public getSpawnGroup(roomName: string) {
        if (this.spawnGroups[roomName]) {
            return this.spawnGroups[roomName];
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
