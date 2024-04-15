interface Memory {
  profiler: ProfilerMemory;
}
interface ProfilerMemory {
	data: { [name: string | symbol]: ProfilerData };
	start?: number;
	end?: number;
	total: number;
}

interface ProfilerData {
	calls: number;
	time: number;
}

interface IProfiler {
  clear(): void;
  output(): void;
  start(time: number | undefined): void;
  status(): void;
  stop(): void;
  finish(): void;
  help(): void;
  endTick(): void;
}
