import { useEffect, useRef, useState } from 'react';
import { KEY, loadGame, runCommit, type Game } from './game';

// Game state with undo and debounced localStorage saves.
export function useGame() {
  const [game, setGameState] = useState<Game>(loadGame);
  const gRef = useRef(game);
  const undoRef = useRef<Game[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const dirty = useRef(false);
  const saveT = useRef<number | undefined>(undefined);

  // only writes when something changed, so closing an idle second tab can't overwrite a newer game
  const writeNow = () => {
    clearTimeout(saveT.current); if (!dirty.current) return; dirty.current = false;
    try { localStorage.setItem(KEY, JSON.stringify(gRef.current)); } catch (e) { console.error('Save failed', e); }
  };
  useEffect(() => {
    addEventListener('pagehide', writeNow);
    return () => removeEventListener('pagehide', writeNow);
  }, []);

  const set = (g: Game) => {
    gRef.current = g; setGameState(g);
    dirty.current = true; clearTimeout(saveT.current); saveT.current = window.setTimeout(writeNow, 200);
  };
  const pushUndo = (g: Game) => {
    undoRef.current.push(g);
    if (undoRef.current.length > 100) undoRef.current.shift();
    setUndoCount(undoRef.current.length);
  };

  return {
    game,
    get: () => gRef.current,
    canUndo: undoCount > 0,
    commit(msg: string, fn: (d: Game) => void) {
      const prev = gRef.current;
      pushUndo(prev);
      set(runCommit(prev, msg, fn));
    },
    undo() {
      const prev = undoRef.current.pop(); if (!prev) return false;
      setUndoCount(undoRef.current.length);
      set(prev);
      return true;
    },
    replace(next: Game, msg: string) {
      pushUndo(gRef.current);
      next.log.unshift({ hand: next.H ? next.H.n : next.hand, msg });
      if (next.log.length > 300) next.log.length = 300;
      set(next);
    },
  };
}
