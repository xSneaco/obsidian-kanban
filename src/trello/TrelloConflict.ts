import { DiffLine, lcsLineDiff } from './TrelloDiffAlgorithm';

export interface ConflictInfo {
  itemId: string;
  notePath: string;
  cardId: string;
  localTitle: string;
  remoteTitle: string;
  localBody: string;
  remoteBody: string;
  bodyDiff: DiffLine[];
  titleChanged: boolean;
}

export interface ConflictResolution {
  keepLocalTitle: boolean;
  keepLocalBody: boolean;
}

export function checkConflict(
  itemId: string,
  notePath: string,
  cardId: string,
  localTitle: string,
  remoteTitle: string,
  localBody: string,
  remoteBody: string
): ConflictInfo {
  return {
    itemId,
    notePath,
    cardId,
    localTitle,
    remoteTitle,
    localBody,
    remoteBody,
    bodyDiff: lcsLineDiff(localBody.split('\n'), remoteBody.split('\n')),
    titleChanged: localTitle !== remoteTitle,
  };
}

export function applyResolution(
  conflict: ConflictInfo,
  resolution: ConflictResolution
): { title: string; body: string } {
  return {
    title: resolution.keepLocalTitle ? conflict.localTitle : conflict.remoteTitle,
    body: resolution.keepLocalBody ? conflict.localBody : conflict.remoteBody,
  };
}
