/* tslint:disable:ban-types */

import { USE_SCREEPS_PROFILER } from "./settings";

//memory defaults
export const profiler_defaults = {
  data: {},
  total: 0,
};

const gameObjects = [{type: Room, label: 'Room'}, 
    {type: Structure, label: 'Structure'}, 
    {type: Spawn, label: 'Spawn'}, 
    {type: Creep, label: 'Creep'},
    {type: PowerCreep, label: 'PowerCreep'},
    {type: RoomPosition, label: 'RoomPosition'}, 
    {type: Source, label: 'Source'}, 
    {type: Flag, label: 'Flag'}
];

//this gets set to global.Profiler for console commands
export function init(): IProfiler {
  
    const cli: IProfiler = {
      clear() {
        const running = isEnabled();
        Memory.profiler = profiler_defaults;
        if (running) { Memory.profiler.start = Game.time; }
        return "Profiler Memory cleared";
      },
  
      output() {
        outputProfilerData();
        return "Done";
      },
  
      start(time: number | undefined) {
        Memory.profiler.start = Game.time;
        if (time) {
          Memory.profiler.end = Game.time+ time;
          return "Profiler started, running for " + time + ' ticks.';
        }
        return "Profiler started";
      },
  
      status() {
        if (isEnabled()) {
          return "Profiler is running";
        }
        return "Profiler is stopped";
      },
      endTick() {
        if (isEnabled() && (Memory.profiler.end || Infinity) <= Game.time) {
          this.finish();
        }
      },
      stop() {
        if (!isEnabled()) { return; }
        const timeRunning = Game.time - Memory.profiler.start!;
        Memory.profiler.total += timeRunning;
        delete Memory.profiler.start;
        delete Memory.profiler.end;
        return "Profiler stopped";
      },
      finish() {
        delete Memory.profiler.start;
        delete Memory.profiler.end;
        this.output();
        this.clear();
      },
      help() {
         return "Profiler.start() - Starts the profiler\n" +
            "Profiler.stop() - Stops/Pauses the profiler\n" +
            "Profiler.status() - Returns whether is profiler is currently running or not\n" +
            "Profiler.output() - Pretty-prints the collected profiler data to the console\n" +
            "Profiler.finish() - stops profiling, outputs, and then clears the memory.\n" +
            "Profiler.clear() - clears profile memory and maintains the profiling state (started or stopped).\n" +
            "Profiler.endTick() - place at the end of your main loop to automatically finish profiling and output.\n" +
            this.status();
       },
    };
    if (USE_SCREEPS_PROFILER){
      hookUpProtoTypes();
    }
    return cli;
  }
  function hookUpProtoTypes() {
    gameObjects.forEach(item => {
        Object.keys(item.type.prototype).forEach((k) => {
          wrapFunction(item.type.prototype, k, item.label);
        });
      })
  }

  
  function wrapFunction(obj: object, key: PropertyKey, className?: string) {
    const descriptor = Reflect.getOwnPropertyDescriptor(obj, key);
    if (!descriptor) {  return;  }
    if (key === "constructor") { return; }
    if (descriptor.get || descriptor.set) { 
      if (!descriptor.configurable) {
        return;
      }
      // Handling configurable properties with getter/setter
      const newDescriptor: PropertyDescriptor = {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable ?? true,  // Assume true if not specified
      };

      if (descriptor.get) {
          newDescriptor.get = function(this: any): any {
              const start = Game.cpu.getUsed();  // Start profiling
              const result = descriptor.get!.apply(this);  // Use non-null assertion for get
              const end = Game.cpu.getUsed();    // End profiling
              const memKey = `${className}:${String(key)}:get`;
              record(memKey, end - start);
              return result;
          };
      }

      if (descriptor.set) {
          newDescriptor.set = function(this: any, newValue: any): void {
              const start = Game.cpu.getUsed();  // Start profiling
              descriptor.set!.apply(this, [newValue]);  // Use non-null assertion for set
              const end = Game.cpu.getUsed();    // End profiling
              const memKey = `${className}:${String(key)}:set`;
              record(memKey, end - start);
          };
      }

      Reflect.defineProperty(obj, key, newDescriptor);
      return;
    }
  
    const originalFunction = descriptor.value;
    if (!originalFunction || typeof originalFunction !== "function") { return; }
  
    // set a key for the object in memory
    if (!className) { className = obj.constructor ? `${obj.constructor.name}` : ""; }
    const memKey = className + `:${String(key)}`;
  
    // set a tag so we don't wrap a function twice
    const savedName = `__${String(key)}__`;
    if (Reflect.has(obj, savedName)) { return; }
  
    Reflect.set(obj, savedName, originalFunction);
  
    ///////////
  
    Reflect.set(obj, key, function(this: any, ...args: any[]) {
      if (isEnabled()) {
        const start = Game.cpu.getUsed();
        const result = originalFunction.apply(this, args);
        const end = Game.cpu.getUsed();
        record(memKey, end - start);
        return result;
      }
      return originalFunction.apply(this, args);
    });
  }
  
  //decorator functions use //@profile to enable on functions and classes
  export function profile(target: Function): void;
  export function profile(target: object, key: string | symbol/*, _descriptor: TypedPropertyDescriptor<Function>*/): void;
  export function profile(
    target: object | Function,
    key?: string | symbol,
    _descriptor?: TypedPropertyDescriptor<Function>,
  ): void {
    if (!USE_SCREEPS_PROFILER) { return; }
  
    if (key) {
      // case of method decorator
      wrapFunction(target, key);
      return;
    }
  
    // case of class decorator
  
    const ctor = target as any;
    if (!ctor.prototype) { return; }
  
    const className = ctor.name;
    Reflect.ownKeys(ctor.prototype).forEach((k) => {
      wrapFunction(ctor.prototype, k, className);
    });
  
  }
  
  function isEnabled(): boolean {
    return Memory.profiler.start !== undefined;
  }
  
  function record(key: string | symbol, time: number) {
    if (!Memory.profiler.data[key]) {
      Memory.profiler.data[key] = {
        calls: 0,
        time: 0,
      };
    }
    Memory.profiler.data[key].calls++;
    Memory.profiler.data[key].time += time;
  }
  
  interface OutputData {
    name: string;
    calls: number;
    cpuPerCall: number;
    callsPerTick: number;
    cpuPerTick: number;
  }
  
  function outputProfilerData() {
    let totalTicks = Memory.profiler.total;
    if (Memory.profiler.start) {
      totalTicks += Game.time - Memory.profiler.start;
    }
  
    ///////
    // Process data
    let totalCpu = 0;  // running count of average total CPU use per tick
    let calls: number;
    let time: number;
    let result: Partial<OutputData>;
    const data = Reflect.ownKeys(Memory.profiler.data).map((key) => {
      calls = Memory.profiler.data[key].calls;
      time = Memory.profiler.data[key].time;
      result = {};
      result.name = `${String(key)}`;
      result.calls = calls;
      result.cpuPerCall = time / calls;
      result.callsPerTick = calls / totalTicks;
      result.cpuPerTick = time / totalTicks;
      totalCpu += result.cpuPerTick;
      return result as OutputData;
    });
  
    data.sort((lhs, rhs) => rhs.cpuPerTick - lhs.cpuPerTick);
  
    ///////
    // Format data
    let output = "";
  
    // get function name max length
    const longestName = (_.max(data, (d) => d.name.length)).name.length + 2;
  
    //// Header line
    output += _.padRight("Function", longestName);
    output += _.padLeft("Tot Calls", 12);
    output += _.padLeft("CPU/Call", 12);
    output += _.padLeft("Calls/Tick", 12);
    output += _.padLeft("CPU/Tick", 12);
    output += _.padLeft("% of Tot\n", 12);
  
    ////  Data lines
    data.forEach((d) => {
      output += _.padRight(`${d.name}`, longestName);
      output += _.padLeft(`${d.calls}`, 12);
      output += _.padLeft(`${d.cpuPerCall.toFixed(2)}ms`, 12);
      output += _.padLeft(`${d.callsPerTick.toFixed(2)}`, 12);
      output += _.padLeft(`${d.cpuPerTick.toFixed(2)}ms`, 12);
      output += _.padLeft(`${(d.cpuPerTick / totalCpu * 100).toFixed(0)} %\n`, 12);
    });
  
    //// Footer line
    output += `${totalTicks} total ticks measured`;
    output += `\t\t\t${totalCpu.toFixed(2)} average CPU profiled per tick`;
    console.log(output);
  }