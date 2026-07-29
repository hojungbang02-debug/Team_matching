/**
 * 팀별 정원을 지키면서 전체 유사도 합을 최대화합니다.
 *
 * 학생 → 팀 배정을 최소비용 최대유량으로 풀며, cost = -similarity를
 * 사용합니다. `fixedTeams`는 비교 실험에서 대표 학생을 자기 팀에
 * 고정할 때 사용합니다.
 */
export function assignCapacityConstrained(
  studentCount: number,
  capacities: number[],
  score: (student: number, team: number) => number,
  fixedTeams: ReadonlyMap<number, number> = new Map(),
): number[] {
  if (
    !Number.isInteger(studentCount) ||
    studentCount < 0 ||
    !capacities.length ||
    capacities.some(
      (capacity) => !Number.isInteger(capacity) || capacity < 0,
    )
  ) {
    throw new Error("학생 수와 팀 정원을 확인해 주세요.");
  }
  if (capacities.reduce((sum, capacity) => sum + capacity, 0) < studentCount) {
    throw new Error("전체 팀 정원이 배정할 학생 수보다 작습니다.");
  }

  const fixedCounts = capacities.map(() => 0);
  for (const [student, team] of fixedTeams) {
    if (
      !Number.isInteger(student) ||
      student < 0 ||
      student >= studentCount ||
      !Number.isInteger(team) ||
      team < 0 ||
      team >= capacities.length
    ) {
      throw new Error("고정 배정이 학생 또는 팀 범위를 벗어났습니다.");
    }
    fixedCounts[team] += 1;
    if (fixedCounts[team] > capacities[team]) {
      throw new Error("고정 배정 인원이 팀 정원을 초과했습니다.");
    }
  }

  const teamCount = capacities.length;
  const source = studentCount + teamCount;
  const sink = source + 1;
  const nodeCount = sink + 1;
  type Edge = { to: number; capacity: number; cost: number; reverse: number };
  const graph: Edge[][] = Array.from({ length: nodeCount }, () => []);

  const addEdge = (
    from: number,
    to: number,
    capacity: number,
    cost: number,
  ) => {
    graph[from].push({
      to,
      capacity,
      cost,
      reverse: graph[to].length,
    });
    graph[to].push({
      to: from,
      capacity: 0,
      cost: -cost,
      reverse: graph[from].length - 1,
    });
  };

  for (let student = 0; student < studentCount; student += 1) {
    addEdge(source, student, 1, 0);
    const fixedTeam = fixedTeams.get(student);
    for (let team = 0; team < teamCount; team += 1) {
      if (fixedTeam !== undefined && fixedTeam !== team) continue;
      const similarity = score(student, team);
      if (!Number.isFinite(similarity)) {
        throw new Error("유사도 점수는 유한한 숫자여야 합니다.");
      }
      addEdge(student, studentCount + team, 1, -similarity);
    }
  }
  for (let team = 0; team < teamCount; team += 1) {
    addEdge(studentCount + team, sink, capacities[team], 0);
  }

  let flow = 0;
  while (flow < studentCount) {
    const distance = Array<number>(nodeCount).fill(Infinity);
    const queued = Array<boolean>(nodeCount).fill(false);
    const previousNode = Array<number>(nodeCount).fill(-1);
    const previousEdge = Array<number>(nodeCount).fill(-1);
    distance[source] = 0;
    const queue = [source];
    queued[source] = true;

    while (queue.length) {
      const node = queue.shift()!;
      queued[node] = false;
      for (let edgeIndex = 0; edgeIndex < graph[node].length; edgeIndex += 1) {
        const edge = graph[node][edgeIndex];
        if (edge.capacity <= 0) continue;
        const nextDistance = distance[node] + edge.cost;
        if (nextDistance >= distance[edge.to] - 1e-12) continue;
        distance[edge.to] = nextDistance;
        previousNode[edge.to] = node;
        previousEdge[edge.to] = edgeIndex;
        if (!queued[edge.to]) {
          queued[edge.to] = true;
          queue.push(edge.to);
        }
      }
    }
    if (!Number.isFinite(distance[sink])) {
      throw new Error("팀 정원을 만족하는 전체 배정을 만들 수 없습니다.");
    }

    let pushed = 1;
    for (let node = sink; node !== source; node = previousNode[node]) {
      const parent = previousNode[node];
      const edgeIndex = previousEdge[node];
      if (parent < 0 || edgeIndex < 0) {
        throw new Error("최적 배정 경로를 복원하지 못했습니다.");
      }
      pushed = Math.min(pushed, graph[parent][edgeIndex].capacity);
    }
    for (let node = sink; node !== source; node = previousNode[node]) {
      const parent = previousNode[node];
      const edge = graph[parent][previousEdge[node]];
      edge.capacity -= pushed;
      graph[node][edge.reverse].capacity += pushed;
    }
    flow += pushed;
  }

  const assignment = Array<number>(studentCount).fill(-1);
  for (let student = 0; student < studentCount; student += 1) {
    for (const edge of graph[student]) {
      if (
        edge.to >= studentCount &&
        edge.to < studentCount + teamCount &&
        edge.capacity === 0
      ) {
        assignment[student] = edge.to - studentCount;
        break;
      }
    }
    if (assignment[student] < 0) {
      throw new Error("일부 학생이 팀에 배정되지 않았습니다.");
    }
  }
  return assignment;
}
