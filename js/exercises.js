// Lista base de exercícios (V1). t: "w" = carga (kg), "bw" = peso corporal (kg extra opcional), "time" = minutos
window.EXERCISES = [
  // Peito
  ["Supino reto (barra)", "Peito", "w"], ["Supino inclinado (barra)", "Peito", "w"], ["Supino com halteres", "Peito", "w"],
  ["Supino inclinado com halteres", "Peito", "w"], ["Supino declinado", "Peito", "w"], ["Crucifixo com halteres", "Peito", "w"],
  ["Peck deck", "Peito", "w"], ["Crossover (cabo)", "Peito", "w"], ["Flexões", "Peito", "bw"], ["Paralelas (dips)", "Peito", "bw"],
  // Costas
  ["Peso morto", "Costas", "w"], ["Barra fixa", "Costas", "bw"], ["Puxada frontal", "Costas", "w"], ["Remada curvada (barra)", "Costas", "w"],
  ["Remada com halter", "Costas", "w"], ["Remada baixa (cabo)", "Costas", "w"], ["Remada cavalinho (T-bar)", "Costas", "w"],
  ["Pullover", "Costas", "w"], ["Hiperextensão lombar", "Costas", "bw"],
  // Pernas
  ["Agachamento (barra)", "Pernas", "w"], ["Agachamento frontal", "Pernas", "w"], ["Agachamento goblet", "Pernas", "w"],
  ["Leg press", "Pernas", "w"], ["Hack squat", "Pernas", "w"], ["Extensão de pernas", "Pernas", "w"], ["Flexão de pernas (curl)", "Pernas", "w"],
  ["Afundos (lunges)", "Pernas", "w"], ["Agachamento búlgaro", "Pernas", "w"], ["Peso morto romeno", "Pernas", "w"],
  ["Hip thrust", "Pernas", "w"], ["Elevação de gémeos", "Pernas", "w"], ["Cadeira adutora", "Pernas", "w"], ["Cadeira abdutora", "Pernas", "w"],
  // Ombros
  ["Desenvolvimento militar (barra)", "Ombros", "w"], ["Desenvolvimento com halteres", "Ombros", "w"], ["Elevação lateral", "Ombros", "w"],
  ["Elevação frontal", "Ombros", "w"], ["Crucifixo invertido", "Ombros", "w"], ["Face pull", "Ombros", "w"], ["Encolhimentos", "Ombros", "w"],
  // Braços
  ["Rosca direta (barra)", "Braços", "w"], ["Rosca com halteres", "Braços", "w"], ["Rosca martelo", "Braços", "w"], ["Rosca scott", "Braços", "w"],
  ["Rosca no cabo", "Braços", "w"], ["Tríceps na polia", "Braços", "w"], ["Tríceps francês", "Braços", "w"], ["Tríceps testa", "Braços", "w"],
  ["Mergulho no banco", "Braços", "bw"], ["Supino fechado", "Braços", "w"],
  // Core
  ["Prancha", "Core", "time"], ["Abdominais (crunch)", "Core", "bw"], ["Elevação de pernas", "Core", "bw"],
  ["Russian twist", "Core", "bw"], ["Roda abdominal", "Core", "bw"], ["Abdominal no cabo", "Core", "w"],
  // Cardio
  ["Passadeira", "Cardio", "time"], ["Bicicleta", "Cardio", "time"], ["Elíptica", "Cardio", "time"],
  ["Remo ergómetro", "Cardio", "time"], ["Corda de saltar", "Cardio", "time"], ["Escada (stairmaster)", "Cardio", "time"],
].map(([n, g, t]) => ({ n, g, t }));
window.BIG3 = ["Agachamento (barra)", "Supino reto (barra)", "Peso morto"];
