export class Archiver {

    private activeSegments: {[segmentId: number]: any };
    private needSegments: {[segmentId: number]: boolean };

    private memory: {
        tempSegments: {[segmentId: number]: any }
        globalSegments: {[id: number]: any }
        globalTimeout: {[id: number]: number };
    };

    constructor() {
        if (!Memory.empire.archiver) { Memory.empire.archiver = {}; }
        this.memory = Memory.empire.archiver;
        if (!this.memory.tempSegments) { this.memory.tempSegments = {}; }
        if (!this.memory.globalSegments) { this.memory.globalSegments = {}; }
        if (!this.memory.globalTimeout) { this.memory.globalTimeout = {}; }
    }

    public init() {
        this.activeSegments = {};
        this.needSegments = {};

        for (let segmentId in RawMemory.segments) {

            // parse
            let segment = {};

            let json = RawMemory.segments[segmentId];
            if (json.length > 0) {
                segment = JSON.parse(RawMemory.segments[segmentId]);
            }

            this.activeSegments[segmentId] = segment;

            // merge temp segments
            let tempSegment = this.memory.tempSegments[segmentId];
            if (tempSegment) {
                for (let identifier in tempSegment) {
                    console.log(`copying temp segment ${identifier} to ${segmentId}`);
                    segment[identifier] = tempSegment[identifier];
                }
                delete this.memory.tempSegments[segmentId];
            }

            if (this.memory.globalTimeout[segmentId]) {
                this.memory.globalSegments[segmentId] = segment;
            }
        }
    }

    public finalize() {
        let activeSegmentsNeeded = _.map(Object.keys(this.needSegments), x => Number.parseInt(x));
        RawMemory.setActiveSegments(activeSegmentsNeeded);

        for (let id in this.activeSegments) {
            let segment = this.activeSegments[id];
            let json = JSON.stringify(segment);
            RawMemory.segments[id] = json;
        }

        for (let id in this.memory.globalTimeout) {
            let timeOut = this.memory.globalTimeout[id];
            if (Game.time < timeOut) { continue; }
            delete this.memory.globalTimeout[id];
            delete this.memory.globalSegments[id];
        }
    }

    public globalGet(segmentId: number) {
        this.memory.globalTimeout[segmentId] = Game.time + 10;
        if (this.memory.globalSegments[segmentId]) {
            return this.memory.globalSegments[segmentId];
        }
        this.needSegments[segmentId] = true;
    }

    public get(segmentId: number) {
        if (!this.activeSegments[segmentId]) {
            this.needSegments[segmentId] = true;
            return;
        }

        return this.activeSegments[segmentId];
    }

    public set(segmentId: number, identifier: string, obj: any) {
        if (this.activeSegments[segmentId]) {
            this.activeSegments[segmentId][identifier] = obj;
            return;
        }

        if (!this.memory.tempSegments[segmentId]) { this.memory.tempSegments[segmentId] = {}; }
        console.log(`saving temp segment ${identifier} to ${segmentId}`);
        this.memory.tempSegments[segmentId][identifier] = obj;
        this.needSegments[segmentId] = true;
    }
}