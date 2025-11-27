import { useEffect, useRef, useCallback } from "react";

/**
 * Хук для защиты от списывания во время интервью
 * Отслеживает:
 * 1. Полноэкранный режим (Fullscreen API) - принудительный вход и блокировка выхода
 * 2. Фокус окна (Window Focus) - переключение на другое приложение
 * 3. Видимость вкладки (Page Visibility API) - переключение вкладок
 * 4. Блокировка контекстного меню (правый клик)
 * 5. Блокировка копирования, вставки и других горячих клавиш
 * 
 * Все нарушения логируются в консоль
 */
export function useAntiCheat(enabled = true) {
  const fullscreenCheckInterval = useRef(null);
  const isFullscreenRequested = useRef(false);

  // Логирование нарушений
  const logViolation = useCallback((type, details = {}) => {
    const timestamp = new Date().toISOString();
    console.warn(`[ANTI-CHEAT VIOLATION] ${type}`, {
      timestamp,
      ...details,
    });
  }, []);

  // 1. Полноэкранный режим (Fullscreen API)
  useEffect(() => {
    if (!enabled) return;

    // Функция для проверки полноэкранного режима
    const checkFullscreen = () => {
      const isFullscreen =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement;

      if (!isFullscreen && isFullscreenRequested.current) {
        logViolation("FULLSCREEN_EXIT", {
          message: "Пользователь вышел из полноэкранного режима",
        });
        // Пытаемся вернуть в полноэкранный режим
        requestFullscreen();
      }
    };

    // Функция для запроса полноэкранного режима
    const requestFullscreen = async () => {
      try {
        const element = document.documentElement;
        if (element.requestFullscreen) {
          await element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
          await element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
          await element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
          await element.msRequestFullscreen();
        }
        isFullscreenRequested.current = true;
      } catch (error) {
        logViolation("FULLSCREEN_REQUEST_FAILED", {
          message: "Не удалось запросить полноэкранный режим",
          error: error.message,
        });
      }
    };

    // Обработчики событий выхода из полноэкранного режима
    const handleFullscreenChange = () => {
      const isFullscreen =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement;

      if (!isFullscreen && isFullscreenRequested.current) {
        logViolation("FULLSCREEN_EXIT", {
          message: "Пользователь вышел из полноэкранного режима (событие)",
        });
        // Пытаемся вернуть в полноэкранный режим
        requestFullscreen();
      }
    };

    // Запрос полноэкранного режима при монтировании
    requestFullscreen();

    // Периодическая проверка (на случай, если события не сработают)
    fullscreenCheckInterval.current = setInterval(checkFullscreen, 1000);

    // Обработчики событий
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    // Блокировка выхода через клавиатуру (ESC)
    const handleKeyDown = (e) => {
      if (e.key === "Escape" || e.keyCode === 27) {
        const isFullscreen =
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement;

        if (isFullscreen) {
          e.preventDefault();
          e.stopPropagation();
          logViolation("FULLSCREEN_ESCAPE_ATTEMPT", {
            message: "Попытка выйти из полноэкранного режима через ESC",
          });
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      if (fullscreenCheckInterval.current) {
        clearInterval(fullscreenCheckInterval.current);
      }
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [enabled, logViolation]);

  // 2. Отслеживание фокуса окна (Window Focus)
  useEffect(() => {
    if (!enabled) return;

    let lastFocusTime = Date.now();
    let isWindowFocused = document.hasFocus();

    const handleFocus = () => {
      const now = Date.now();
      const timeAway = now - lastFocusTime;
      
      if (timeAway > 1000) {
        // Если окно было не в фокусе более 1 секунды
        logViolation("WINDOW_FOCUS_LOST", {
          message: "Окно потеряло фокус (пользователь переключился на другое приложение)",
          timeAway: `${Math.round(timeAway / 1000)}s`,
        });
      }
      
      isWindowFocused = true;
      lastFocusTime = now;
    };

    const handleBlur = () => {
      isWindowFocused = false;
      lastFocusTime = Date.now();
      logViolation("WINDOW_BLUR", {
        message: "Окно потеряло фокус",
      });
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    // Периодическая проверка фокуса (на случай, если события не сработают)
    const focusCheckInterval = setInterval(() => {
      const currentlyFocused = document.hasFocus();
      
      if (!currentlyFocused && isWindowFocused) {
        isWindowFocused = false;
        lastFocusTime = Date.now();
        logViolation("WINDOW_FOCUS_LOST", {
          message: "Окно потеряло фокус (проверка)",
        });
      } else if (currentlyFocused && !isWindowFocused) {
        const now = Date.now();
        const timeAway = now - lastFocusTime;
        
        if (timeAway > 1000) {
          logViolation("WINDOW_FOCUS_RESTORED", {
            message: "Окно вернуло фокус после потери",
            timeAway: `${Math.round(timeAway / 1000)}s`,
          });
        }
        
        isWindowFocused = true;
      }
    }, 500);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      clearInterval(focusCheckInterval);
    };
  }, [enabled, logViolation]);

  // 3. Детекция переключения вкладок (Page Visibility API)
  useEffect(() => {
    if (!enabled) return;

    let lastVisibilityChange = Date.now();
    let isVisible = !document.hidden;

    const handleVisibilityChange = () => {
      const now = Date.now();
      const isCurrentlyVisible = !document.hidden;

      if (!isCurrentlyVisible && isVisible) {
        // Вкладка стала скрытой
        lastVisibilityChange = now;
        logViolation("TAB_SWITCH", {
          message: "Пользователь переключился на другую вкладку",
        });
        isVisible = false;
      } else if (isCurrentlyVisible && !isVisible) {
        // Вкладка стала видимой
        const timeHidden = now - lastVisibilityChange;
        logViolation("TAB_RETURN", {
          message: "Пользователь вернулся на вкладку",
          timeHidden: `${Math.round(timeHidden / 1000)}s`,
        });
        isVisible = true;
      }
    };

    // Проверка при монтировании
    if (document.hidden) {
      logViolation("TAB_INITIALLY_HIDDEN", {
        message: "Вкладка изначально скрыта",
      });
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Периодическая проверка (на случай, если события не сработают)
    const visibilityCheckInterval = setInterval(() => {
      const currentlyVisible = !document.hidden;
      
      if (!currentlyVisible && isVisible) {
        lastVisibilityChange = Date.now();
        logViolation("TAB_SWITCH", {
          message: "Пользователь переключился на другую вкладку (проверка)",
        });
        isVisible = false;
      } else if (currentlyVisible && !isVisible) {
        const now = Date.now();
        const timeHidden = now - lastVisibilityChange;
        logViolation("TAB_RETURN", {
          message: "Пользователь вернулся на вкладку (проверка)",
          timeHidden: `${Math.round(timeHidden / 1000)}s`,
        });
        isVisible = true;
      }
    }, 500);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(visibilityCheckInterval);
    };
  }, [enabled, logViolation]);

  // 4. Блокировка контекстного меню и копирования
  useEffect(() => {
    if (!enabled) return;

    // Блокировка контекстного меню (правый клик)
    const handleContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      logViolation("CONTEXT_MENU_ATTEMPT", {
        message: "Попытка открыть контекстное меню (правый клик)",
      });
      return false;
    };

    // Блокировка выделения текста (опционально, но может мешать вводу)
    // Оставляем возможность выделять для редактирования, но блокируем копирование

    // Блокировка горячих клавиш для копирования, вставки и других действий
    const handleKeyDown = (e) => {
      const ctrlKey = e.ctrlKey || e.metaKey; // metaKey для Mac (Cmd)
      const shiftKey = e.shiftKey;

      // Блокировка копирования (Ctrl+C, Ctrl+Insert, Cmd+C)
      if ((ctrlKey && (e.key === "c" || e.key === "C" || e.keyCode === 67)) ||
          (e.key === "Insert" && ctrlKey) ||
          (e.keyCode === 45 && ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        logViolation("COPY_ATTEMPT", {
          message: "Попытка скопировать содержимое",
          key: e.key,
          keyCode: e.keyCode,
        });
        return false;
      }

      // Блокировка вставки (Ctrl+V, Shift+Insert, Cmd+V)
      if ((ctrlKey && (e.key === "v" || e.key === "V" || e.keyCode === 86)) ||
          (e.key === "Insert" && shiftKey) ||
          (e.keyCode === 45 && shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        logViolation("PASTE_ATTEMPT", {
          message: "Попытка вставить содержимое",
          key: e.key,
          keyCode: e.keyCode,
        });
        return false;
      }

      // Блокировка вырезания (Ctrl+X, Shift+Delete, Cmd+X)
      if ((ctrlKey && (e.key === "x" || e.key === "X" || e.keyCode === 88)) ||
          (e.key === "Delete" && shiftKey) ||
          (e.keyCode === 46 && shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        logViolation("CUT_ATTEMPT", {
          message: "Попытка вырезать содержимое",
          key: e.key,
          keyCode: e.keyCode,
        });
        return false;
      }

      // Блокировка выделения всего (Ctrl+A, Cmd+A)
      if (ctrlKey && (e.key === "a" || e.key === "A" || e.keyCode === 65)) {
        e.preventDefault();
        e.stopPropagation();
        logViolation("SELECT_ALL_ATTEMPT", {
          message: "Попытка выделить всё содержимое",
          key: e.key,
          keyCode: e.keyCode,
        });
        return false;
      }

      // Блокировка открытия DevTools
      // F12
      if (e.key === "F12" || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        logViolation("DEVTOOLS_ATTEMPT", {
          message: "Попытка открыть DevTools (F12)",
          key: e.key,
          keyCode: e.keyCode,
        });
        return false;
      }

      // Ctrl+Shift+I (Chrome DevTools)
      if (ctrlKey && shiftKey && (e.key === "I" || e.key === "i" || e.keyCode === 73)) {
        e.preventDefault();
        e.stopPropagation();
        logViolation("DEVTOOLS_ATTEMPT", {
          message: "Попытка открыть DevTools (Ctrl+Shift+I)",
          key: e.key,
          keyCode: e.keyCode,
        });
        return false;
      }

      // Ctrl+Shift+J (Chrome Console)
      if (ctrlKey && shiftKey && (e.key === "J" || e.key === "j" || e.keyCode === 74)) {
        e.preventDefault();
        e.stopPropagation();
        logViolation("DEVTOOLS_ATTEMPT", {
          message: "Попытка открыть консоль (Ctrl+Shift+J)",
          key: e.key,
          keyCode: e.keyCode,
        });
        return false;
      }

      // Ctrl+Shift+C (Chrome Element Inspector)
      if (ctrlKey && shiftKey && (e.key === "C" || e.key === "c" || e.keyCode === 67)) {
        e.preventDefault();
        e.stopPropagation();
        logViolation("DEVTOOLS_ATTEMPT", {
          message: "Попытка открыть инспектор элементов (Ctrl+Shift+C)",
          key: e.key,
          keyCode: e.keyCode,
        });
        return false;
      }

      // Ctrl+U (просмотр исходного кода)
      if (ctrlKey && (e.key === "u" || e.key === "U" || e.keyCode === 85)) {
        e.preventDefault();
        e.stopPropagation();
        logViolation("VIEW_SOURCE_ATTEMPT", {
          message: "Попытка просмотреть исходный код (Ctrl+U)",
          key: e.key,
          keyCode: e.keyCode,
        });
        return false;
      }

      // Ctrl+S (сохранение страницы)
      if (ctrlKey && (e.key === "s" || e.key === "S" || e.keyCode === 83)) {
        e.preventDefault();
        e.stopPropagation();
        logViolation("SAVE_PAGE_ATTEMPT", {
          message: "Попытка сохранить страницу (Ctrl+S)",
          key: e.key,
          keyCode: e.keyCode,
        });
        return false;
      }

      // Ctrl+P (печать, может использоваться для сохранения как PDF)
      if (ctrlKey && (e.key === "p" || e.key === "P" || e.keyCode === 80)) {
        e.preventDefault();
        e.stopPropagation();
        logViolation("PRINT_ATTEMPT", {
          message: "Попытка открыть диалог печати (Ctrl+P)",
          key: e.key,
          keyCode: e.keyCode,
        });
        return false;
      }
    };

    // Блокировка копирования через события copy, cut, selectstart
    const handleCopy = (e) => {
      e.preventDefault();
      e.stopPropagation();
      logViolation("COPY_EVENT", {
        message: "Попытка скопировать через событие copy",
      });
      return false;
    };

    const handleCut = (e) => {
      e.preventDefault();
      e.stopPropagation();
      logViolation("CUT_EVENT", {
        message: "Попытка вырезать через событие cut",
      });
      return false;
    };

    const handlePaste = (e) => {
      e.preventDefault();
      e.stopPropagation();
      logViolation("PASTE_EVENT", {
        message: "Попытка вставить через событие paste",
      });
      return false;
    };

    // Блокировка выделения (опционально, но может мешать редактированию)
    // Оставляем возможность выделять для редактирования текста в полях ввода
    // Но блокируем копирование

    // Добавляем обработчики
    document.addEventListener("contextmenu", handleContextMenu, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("copy", handleCopy, true);
    document.addEventListener("cut", handleCut, true);
    document.addEventListener("paste", handlePaste, true);

    // Блокировка через CSS (user-select: none для body, но разрешаем для input/textarea)
    const originalUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    
    // Разрешаем выделение в полях ввода
    const style = document.createElement("style");
    style.textContent = `
      input, textarea {
        user-select: text !important;
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("copy", handleCopy, true);
      document.removeEventListener("cut", handleCut, true);
      document.removeEventListener("paste", handlePaste, true);
      document.body.style.userSelect = originalUserSelect;
      document.head.removeChild(style);
    };
  }, [enabled, logViolation]);
}

