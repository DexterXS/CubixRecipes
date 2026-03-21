import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

afterEach(() => cleanup());
import App from "./pages/App";

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    json: async () => ({
      recipe: {
        matrix: [
          [{ raw: "<minecraft:planks>" }, { raw: null }],
          [{ raw: null }, { raw: "<minecraft:planks>" }]
        ]
      }
    })
  }) as unknown as typeof fetch;
});

test("paste triggers parse", async () => {
  render(<App />);
  const textarea = screen.getByLabelText("paste-input");
  fireEvent.paste(textarea, {
    clipboardData: {
      getData: () => "recipes.addShaped(...)"
    }
  });
  await waitFor(() => expect(screen.getByText("Рецепт загружен")).toBeTruthy());
});

test("edit cell updates state", () => {
  render(<App />);
  const cell = screen.getByLabelText("cell-0-0") as HTMLInputElement;
  fireEvent.change(cell, { target: { value: "<minecraft:stone>" } });
  expect(cell.value).toBe("<minecraft:stone>");
});
