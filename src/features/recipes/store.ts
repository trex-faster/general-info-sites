import type { Recipe } from '@/core/types';

export async function getRecipes(): Promise<Recipe[]> {
  return ((await browser.storage.local.get('recipes')).recipes as Recipe[] | undefined) ?? [];
}
export async function saveRecipe(r: Recipe): Promise<void> {
  await browser.storage.local.set({ recipes: [...(await getRecipes()), r] });
}
export async function deleteRecipe(id: string): Promise<Recipe[]> {
  const next = (await getRecipes()).filter((r) => r.id !== id);
  await browser.storage.local.set({ recipes: next });
  return next;
}
