import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent, PointerEvent } from 'react';

/** DOM 밖에 렌더링되는 프로필 메뉴도 사이드바 상호작용에 포함한다. */
export function useFloatingSidebar(isMobile: boolean) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const interaction = useRef({
    hovered: false,
    focused: false,
    profile: false,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelClose = useCallback(() => {
    clearTimeout(timer.current);
  }, []);
  const changeOpen = useCallback(
    (next: boolean) => {
      cancelClose();
      setOpen(next);
    },
    [cancelClose],
  );
  const closeWhenIdle = useCallback(() => {
    cancelClose();
    timer.current = setTimeout(() => {
      const { hovered, focused, profile } = interaction.current;
      if (!hovered && !focused && !profile) setOpen(false);
    }, 150);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);
  useFloatingDismiss(panelRef, interaction, changeOpen, isMobile);

  return {
    open,
    changeOpen,
    panelRef,
    onProfileOpenChange: (next: boolean) => {
      interaction.current.profile = next;
      if (isMobile) return;
      if (next) changeOpen(true);
      else closeWhenIdle();
    },
    panelEvents: {
      onPointerEnter(event: PointerEvent<HTMLDivElement>) {
        if (isMobile || event.pointerType === 'touch') return;
        interaction.current.hovered = true;
        changeOpen(true);
      },
      onPointerLeave(event: PointerEvent<HTMLDivElement>) {
        if (isMobile || event.pointerType === 'touch') return;
        interaction.current.hovered = false;
        closeWhenIdle();
      },
      onFocusCapture(event: FocusEvent<HTMLDivElement>) {
        if (isMobile) return;
        interaction.current.focused = true;
        if (event.target.closest('[data-sidebar="trigger"]')) return;
        // 내부 포커스 이동과 드롭다운의 포커스 복원은 명시적 닫기를 취소하지 않는다.
        if (!event.currentTarget.contains(event.relatedTarget))
          changeOpen(true);
      },
      onBlurCapture(event: FocusEvent<HTMLDivElement>) {
        if (isMobile || event.currentTarget.contains(event.relatedTarget))
          return;
        interaction.current.focused = false;
        closeWhenIdle();
      },
    },
  };
}

function useFloatingDismiss(
  panel: { current: HTMLDivElement | null },
  interaction: {
    current: { hovered: boolean; focused: boolean; profile: boolean };
  },
  changeOpen: (open: boolean) => void,
  isMobile: boolean,
) {
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const reset = () => {
      interaction.current = { hovered: false, focused: false, profile: false };
      changeOpen(false);
    };
    media.addEventListener('change', reset);
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        isMobile ||
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        interaction.current.profile
      )
        return;
      changeOpen(false);
    };
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (
        isMobile ||
        interaction.current.profile ||
        !(event.target instanceof Node)
      )
        return;
      if (!panel.current?.contains(event.target)) changeOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      media.removeEventListener('change', reset);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [changeOpen, interaction, isMobile, panel]);
}
