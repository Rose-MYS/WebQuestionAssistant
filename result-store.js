var ResultStore = (() => {
  const DATABASE_NAME = "edge-question-helper";
  const DATABASE_VERSION = 1;
  const STORE_NAME = "results";
  const MAX_RECORDS = 5;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("无法打开本地结果存储。"));
      request.onblocked = () => reject(new Error("本地结果存储正在被其他页面占用，请稍后重试。"));
    });
  }

  async function runTransaction(mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      try {
        result = operation(store);
      } catch (error) {
        database.close();
        reject(error);
        return;
      }
      transaction.oncomplete = () => {
        database.close();
        resolve(result?.result);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || new Error("无法保存本地截图结果。"));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error || new Error("本地截图结果保存已取消。"));
      };
    });
  }

  async function create(record) {
    const id = crypto.randomUUID();
    await runTransaction("readwrite", (store) => store.add({ ...record, id }));
    await prune();
    return id;
  }

  async function get(id) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("无法读取本地解答记录。"));
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || new Error("无法读取本地解答记录。"));
      };
    });
  }

  async function update(id, changes) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) {
          transaction.abort();
          reject(new Error("本地截图记录已不存在，请重新截取。"));
          return;
        }
        store.put({ ...request.result, ...changes, id });
      };
      request.onerror = () => {
        database.close();
        reject(request.error || new Error("无法更新本地解答记录。"));
      };
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || new Error("无法更新本地解答记录。"));
      };
      transaction.onabort = () => {
        database.close();
      };
    });
  }

  async function prune() {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result.sort((left, right) => right.createdAt - left.createdAt);
        for (const record of records.slice(MAX_RECORDS)) {
          store.delete(record.id);
        }
      };
      request.onerror = () => {
        database.close();
        reject(request.error || new Error("无法清理旧截图记录。"));
      };
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || new Error("无法清理旧截图记录。"));
      };
    });
  }

  return { create, get, update };
})();
