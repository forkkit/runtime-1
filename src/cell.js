import Mutable from "./mutable";
import {defaultLibrary} from "./library";

const {Generators: {input, observe}} = defaultLibrary;

export default function Cell(notebook, node) {
  Object.defineProperties(this, {
    _node: {value: node},
    _notebook: {value: notebook},
    _error: {value: undefined, writable: true},
    _variable: {value: notebook._main.variable(node)},
    _loaded: {value: false, writable: true},
    _view: {value: null, writable: true},
    _imports: {value: null, writable: true},
    _source: {value: null, writable: true}
  });
}

Object.defineProperties(Cell.prototype, {
  define: {value: cell_define, writable: true, configurable: true},
  delete: {value: cell_delete, writable: true, configurable: true}
});

function cell_define(definition) {
  const reachable = this._notebook._reachable;
  cell_deleteImports(this);
  if (definition.modules) {
    const imports = [];
    const module = this._notebook._module(definition.id);

    definition.modules.forEach(definition => {
      const module = this._notebook._module(definition.id);
      definition.values.forEach(definition => {
        let variable = module._scope.get(definition.name); // TODO Cleaner?
        if (variable) {
          variable._exdegree = (variable._exdegree || 0) + 1;
        } else {
          variable = module.variable();
          variable._exdegree = 1;
        }
        if (definition.module) {
          variable.import(
            definition.remote,
            definition.name,
            this._notebook._module(definition.module)
          );
        } else if (definition.view) {
          const view = module_variable(module, `viewof ${definition.name}`);
          cell_defineView(definition, view, variable);
          imports.push(view);
        } else if (definition.mutable) {
          const mutable = module_variable(module, `mutable ${definition.name}`);
          cell_defineMutable(definition, mutable, variable);
          imports.push(mutable);
        } else {
          variable.define(
            definition.name,
            definition.inputs,
            definition.value
          );
        }
        imports.push(variable);
      });
    });

    definition.imports.forEach(definition => {
      const variable = this._notebook._main.variable();
      variable._exdegree = 1;
      variable.import(definition.remote, definition.name, module);
      imports.push(variable);
      reachable.set(definition.name, variable);
    });

    cell_deleteSource(this);
    this._imports = imports;
    this._variable.define(cell_displayImport(definition));
  } else if (definition.view) {
    if (!this._source) this._source = this._notebook._main.variable();
    cell_defineView(definition, this._variable, this._source);
  } else if (definition.mutable) {
    if (!this._source) this._source = this._notebook._main.variable();
    cell_defineMutable(definition, this._source, this._variable);
  } else {
    cell_deleteSource(this);
    this._variable.define(
      definition.name,
      definition.inputs,
      definition.value
    );
  }
  if (definition.name) reachable.set(definition.name, this._variable);
  return this;
}

function module_variable(module, reference) {
  let variable = module._scope.get(reference); // TODO Cleaner?
  if (variable) {
    variable._exdegree = (variable._exdegree || 0) + 1;
  } else {
    variable = module.variable();
    variable._exdegree = 1;
  }
  return variable;
}

function cell_defineView(definition, view, value) {
  const reference = `viewof ${definition.name}`;
  view.define(reference, definition.inputs, definition.value);
  value.define(definition.name, [reference], input);
}

function cell_defineMutable(definition, initializer, value) {
  let change,
    observer = observe(_ => (change = _));
  const reference = `mutable ${definition.name}`;
  initializer.define(
    reference,
    definition.inputs,
    variable_mutable(change, definition.value)
  );
  value.define(definition.name, [reference], observer);
}

function cell_displayImport(definition) {
  const span = document.createElement("span");
  span.className = "O--inspect O--import";
  span.appendChild(document.createTextNode("import "));
  const a = span.appendChild(document.createElement("a"));
  a.href = `${definition.origin}/${definition.module.replace(/@[0-9]+(?=\?|$)/, "")}`;
  a.textContent = definition.module;
  return span;
}

function cell_delete() {
  cell_deleteImports(this);
  cell_deleteSource(this);
  this._variable.delete();
}

// TODO Delete empty modules after detaching?
function cell_deleteImports(cell) {
  if (cell._imports) {
    cell._imports.forEach(import_detach);
    cell._imports = null;
  }
}

function cell_deleteSource(cell) {
  if (cell._source) {
    cell._source.delete();
    cell._source = null;
  }
}

function import_detach(variable) {
  if (--variable._exdegree === 0) {
    variable.delete();
  }
}

function variable_mutable(change, value) {
  return function() {
    return new Mutable(change, value.apply(this, arguments));
  };
}
