import { useEffect, useRef, type ReactNode } from 'react';
import './control.css';

export function ControlDraftWorkspace({ monitor, children }: {monitor:ReactNode;children:ReactNode}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container=root.current;
    const board=container?.querySelector<HTMLElement>('.compact-board');
    if(!container||!board) return;

    let frame=0;
    const measure=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const height=Math.ceil(board.getBoundingClientRect().height);
        container.style.setProperty('--monitor-height',`${height+8}px`);
      });
    };

    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(board);
    observer.observe(container);
    window.addEventListener('resize',measure);
    window.visualViewport?.addEventListener('resize',measure);

    return()=>{
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize',measure);
      window.visualViewport?.removeEventListener('resize',measure);
    };
  }, []);

  return <div ref={root} className="control-draft-workspace"><aside className="control-monitor">{monitor}</aside>{children}</div>;
}
