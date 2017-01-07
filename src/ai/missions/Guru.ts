import {Empire} from "../Empire";
export abstract class Guru {

    protected flag: Flag;
    protected room: Room;
    protected empire: Empire;
    protected memory: any;

    constructor(host: {flag: Flag, memory: any, empire: Empire}) {
        this.flag = host.flag;
        this.room = this.flag.room;
        this.empire = host.empire;
        let hostMemory = host.memory;
        if (!hostMemory.anal) { hostMemory.anal = {}; }
        this.memory = hostMemory.anal;
    }
}