# Copyright 2026 Joey Parrish
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -I./libcaption
LDFLAGS = -L./libcaption -lcaption

all: libcaption/libcaption.a generator

libcaption/libcaption.a:
	./build-lib.sh

generator: generator.cpp libcaption/libcaption.a
	$(CXX) $(CXXFLAGS) -o generator generator.cpp $(LDFLAGS)

golden: generator
	./generator

clean:
	rm -f generator

distclean: clean
	rm -rf golden libcaption

.PHONY: all golden clean distclean
