/**
 * Recursively converts ISO date strings to Date objects in nested objects
 */
function convertDatesInObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Check if string is an ISO date format
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    if (isoDateRegex.test(obj)) {
      const date = new Date(obj);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => convertDatesInObject(item));
  }

  if (typeof obj === 'object') {
    const converted: any = {};
    for (const key in obj) {
      converted[key] = convertDatesInObject(obj[key]);
    }
    return converted;
  }

  return obj;
}

export function getCleanFormData<T>(
  data: FormData,
  {
    delete: deleteKeys = [],
    jsonParse: jsonParseKeys = [],
    boolean: booleanKeys = [],
    number: numberKeys = [],
    date: dateKeys = [],
  }: {
    delete?: string[];
    jsonParse?: string[];
    boolean?: string[];
    number?: string[];
    date?: string[];
  } = {
    delete: [],
    jsonParse: [],
    boolean: [],
    number: [],
    date: [],
  },
) {
  const formData: Record<string, any> = Object.fromEntries(data.entries());

  // delete empty values and $ACTION OR $ keys
  for (const key in formData) {
    if (formData[key] === '' || key.startsWith('$')) delete formData[key];
  }

  // delete file field names (remove -file suffix fields)
  for (const key in formData) {
    if (key.endsWith('-file')) {
      delete formData[key];
    }
  }

  // delete keys
  for (const key of deleteKeys) {
    delete formData[key];
  }

  // parse json keys
  for (const key of jsonParseKeys) {
    if (formData[key]) {
      try {
        if (typeof formData[key] === 'string') {
          formData[key] = JSON.parse(formData[key]);
          // Convert any ISO date strings to Date objects
          formData[key] = convertDatesInObject(formData[key]);
        }
      } catch (e) {
        console.error(`Error parsing json for key: ${key}`);
      }
    }
  }

  // parse boolean keys
  for (const key of booleanKeys) {
    if (formData[key] !== undefined) {
      const value = String(formData[key]).toLowerCase();
      if (value === 'true' || value === '1' || value === 'on' || value === 'yes' || value === 'checked') {
        formData[key] = true;
      } else if (value === 'false' || value === '0' || value === 'off' || value === 'no' || value === 'unchecked') {
        formData[key] = false;
      }
    }
  }

  // parse number keys
  for (const key of numberKeys) {
    if (formData[key] !== undefined && formData[key] !== '') {
      const numValue = Number(formData[key]);
      if (!isNaN(numValue)) {
        formData[key] = numValue;
      } else {
        // If conversion fails, delete the key to avoid sending invalid data
        delete formData[key];
      }
    }
  }

  // parse date keys
  for (const key of dateKeys) {
    if (formData[key] !== undefined && formData[key] !== '') {
      const dateValue = new Date(formData[key]);
      if (!isNaN(dateValue.getTime())) {
        formData[key] = dateValue;
      } else {
        // If conversion fails, delete the key to avoid sending invalid data
        delete formData[key];
      }
    }
  }

  return formData as T;
}
