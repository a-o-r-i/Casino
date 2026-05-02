(() => {
  let TableModulePromise = null;
  const ModuleUrl = document.currentScript?.dataset.blackjackModuleUrl || new URL("./BlackjackTable.js", document.currentScript?.src || window.location.href).href;
  const LoadTableModule = () => {
    if (!TableModulePromise) {
      TableModulePromise = import(ModuleUrl);
    }
    return TableModulePromise;
  };
  const InitializeBlackjackSessionPage = ({
    main: Main
  }) => {
    let Cleanup = null;
    let IsDisposed = false;
    void LoadTableModule().then(({
      InitializeBlackjackTable
    }) => {
      return InitializeBlackjackTable({
        root: Main
      });
    }).then(CleanupValue => {
      if (IsDisposed) {
        CleanupValue?.();
        return;
      }
      Cleanup = typeof CleanupValue === "function" ? CleanupValue : null;
    }).catch(ErrorValue => {
      console.error(ErrorValue);
    });
    return () => {
      IsDisposed = true;
      if (typeof Cleanup === "function") {
        Cleanup();
        Cleanup = null;
      }
    };
  };
  window.GamblingApp?.registerPageInitializer("blackjack-session", InitializeBlackjackSessionPage);
})();
/* github-refresh: 2026-05-02T02:31:53Z */
