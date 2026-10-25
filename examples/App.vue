<template>
    <h1>mkon ↔ JSON</h1>
    <!-- ярус 1: mkon → JS → JSON -->
    <div class="row">
        <div class="pane">
            <h2>mkon (ввод)</h2>
            <textarea v-model="mkonIn" @input="frommkon" spellcheck="false"></textarea>
        </div>
        <div class="pane">
            <h2>JS представление</h2>
            <div class="tree">
                <TreeNode v-if="!mkonError" :value="mkonValue" />
                <div v-else class="error">{{ mkonError }}</div>
            </div>
        </div>
        <div class="pane">
            <h2>JSON (результат)</h2>
            <textarea :value="jsonOut" readonly spellcheck="false"></textarea>
        </div>
    </div>

    <OptionsPanel v-model="opt" @update:model-value="frommkon(); fromJson()" />

    <!-- ярус 2: JSON → JS → mkon -->
    <div class="row">
        <div class="pane">
            <h2>JSON (ввод)</h2>
            <textarea v-model="jsonIn" @input="fromJson" spellcheck="false"></textarea>
        </div>
        <div class="pane">
            <h2>JS представление</h2>
            <div class="tree">
                <TreeNode v-if="!jsonError" :value="jsonValue" />
                <div v-else class="error">{{ jsonError }}</div>
            </div>
        </div>
        <div class="pane">
            <h2>mkon (результат)</h2>
            <textarea :value="mkonOut" readonly spellcheck="false"></textarea>
        </div>
    </div>
</template>
<script setup>
import { ref } from 'vue'
import mkon from 'mkon'
import TreeNode from './TreeNode.vue'
import OptionsPanel from './OptionsPanel.vue'

import mkon_str from './test.mkon?raw'

const opt = ref({
    quotes: 'min',
    quoteChar: '"',
    space: 2,
    eol: '\n',
    bracesSameLine: false,
    emitRootBraces: true,
    separator: false,
    sortProps: false,
    keepWsc: false,
    multiline: 'std',
    condense: 0,
    colors: false,
})

// ---------- ярус 1: mkon → JS → JSON ----------
const mkonIn = ref(mkon_str)
const mkonValue = ref(null)
const jsonOut = ref('')
const mkonError = ref('')

function frommkon() {
    mkonError.value = ''
    try {
        const v = mkon.parse(mkonIn.value)
        mkonValue.value = v
        jsonOut.value = JSON.stringify(v, null, 2)
    } catch (e) {
        mkonError.value = String(e.message || e)
        jsonOut.value = ''
    }
}

// ---------- ярус 2: JSON → JS → mkon ----------
const jsonIn = ref(JSON.stringify(mkon.parse(mkon_str), null, 2))
const jsonValue = ref(null)
const mkonOut = ref('')
const jsonError = ref('')

function fromJson() {
    jsonError.value = ''
    try {
        const v = JSON.parse(jsonIn.value)
        jsonValue.value = v
        mkonOut.value = mkon.stringify(v, opt.value)
    } catch (e) {
        jsonError.value = String(e.message || e)
        mkonOut.value = ''
    }
}
// начальный прогон
frommkon()
fromJson()
</script>