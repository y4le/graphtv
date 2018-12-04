<template>
  <div class='search_bar'>
    Search Bar
    <input v-model='message' />
  </div>
  <div class='search_term'>{{message}}</div>
</template>

<script>
export default {
  name: 'SearchBar',
  props: {
  }
}
</script>

<style scoped>
</style>