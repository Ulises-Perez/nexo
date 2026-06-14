<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-900 px-4">
    <div class="max-w-md w-full space-y-8 bg-gray-800 p-8 rounded-xl shadow-2xl">
      <div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-white">Registro</h2>
        <p class="mt-2 text-center text-sm text-gray-400">
          Crea tu cuenta en Nexo
        </p>
      </div>
      <form class="mt-8 space-y-6" @submit.prevent="handleRegister">
        <div class="rounded-md shadow-sm space-y-4">
          <div>
            <label for="username" class="sr-only">Nombre de Usuario</label>
            <input id="username" v-model="username" name="username" type="text" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-700 bg-gray-700 placeholder-gray-400 text-white rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="Nombre de Usuario">
          </div>
          <div>
            <label for="email" class="sr-only">Correo Electrónico</label>
            <input id="email" v-model="email" name="email" type="email" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-700 bg-gray-700 placeholder-gray-400 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="Correo Electrónico">
          </div>
          <div>
            <label for="password" class="sr-only">Contraseña</label>
            <input id="password" v-model="password" name="password" type="password" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-700 bg-gray-700 placeholder-gray-400 text-white rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="Contraseña">
          </div>
        </div>

        <div v-if="error" class="text-red-500 text-sm text-center">{{ error }}</div>

        <div>
          <button type="submit" :disabled="loading" class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50">
            {{ loading ? 'Registrando...' : 'Registrarse' }}
          </button>
        </div>
      </form>
      <div class="text-center mt-4">
        <router-link to="/login" class="text-indigo-400 hover:text-indigo-300 text-sm">¿Ya tienes cuenta? Inicia sesión</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import api from '../api/axios';

const username = ref('');
const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const router = useRouter();
const authStore = useAuthStore();

const handleRegister = async () => {
  error.value = '';
  loading.value = true;
  try {
    await api.post('/auth/register', {
      username: username.value,
      email: email.value,
      password: password.value, // Frontend envia 'password', Backend espera 'password'
    });
    
    // Auto-login después de registro
    const loginResponse = await api.post('/auth/login', {
       email: email.value,
       password: password.value,
    });

    authStore.setToken(loginResponse.data.token);
    await authStore.fetchUser();
    
    router.push('/dashboard');
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Error al registrar usuario';
  } finally {
    loading.value = false;
  }
};
</script>
